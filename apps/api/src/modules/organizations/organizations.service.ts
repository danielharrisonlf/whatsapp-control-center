import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { randomToken, sha256 } from '../../common/crypto';
import { iso, isoOrNull } from '../../common/dto';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const INVITATION_TTL_DAYS = 7;

function slugify(name: string) {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomToken(4)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5)}`;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      createdAt: iso(m.organization.createdAt),
    }));
  }

  async create(userId: string, name: string) {
    const org = await this.prisma.organization.create({
      data: { name, slug: slugify(name), memberships: { create: { userId, role: 'OWNER' } } },
    });
    await this.audit.record({
      organizationId: org.id,
      actorId: userId,
      action: 'ORGANIZATION_CREATED',
      resource: 'organization',
      resourceId: org.id,
      metadata: { name },
    });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: 'OWNER' as const,
      createdAt: iso(org.createdAt),
    };
  }

  async get(organizationId: string, role: Role) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return { id: org.id, name: org.name, slug: org.slug, role, createdAt: iso(org.createdAt) };
  }

  async update(organizationId: string, role: Role, name: string) {
    const org = await this.prisma.organization.update({ where: { id: organizationId }, data: { name } });
    await this.audit.record({
      organizationId,
      action: 'ORGANIZATION_UPDATED',
      resource: 'organization',
      resourceId: organizationId,
      metadata: { name },
    });
    return { id: org.id, name: org.name, slug: org.slug, role, createdAt: iso(org.createdAt) };
  }

  async delete(organizationId: string) {
    await this.prisma.organization.delete({ where: { id: organizationId } });
  }

  async listMembers(organizationId: string) {
    const members = await this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      role: m.role,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        lastLoginAt: isoOrNull(m.user.lastLoginAt),
      },
      createdAt: iso(m.createdAt),
    }));
  }

  async updateMemberRole(organizationId: string, actorRole: Role, memberId: string, role: Role) {
    const member = await this.prisma.membership.findFirst({ where: { id: memberId, organizationId } });
    if (!member) throw notFound('Member');
    if ((role === 'OWNER' || member.role === 'OWNER') && actorRole !== 'OWNER') {
      throw forbidden('Only owners can grant or remove the owner role.');
    }
    if (member.role === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(organizationId);
    await this.prisma.membership.update({ where: { id: memberId }, data: { role } });
    await this.audit.record({
      organizationId,
      action: 'MEMBER_ROLE_CHANGED',
      resource: 'membership',
      resourceId: memberId,
      metadata: { from: member.role, to: role, userId: member.userId },
    });
    return (await this.listMembers(organizationId)).find((m) => m.id === memberId)!;
  }

  async removeMember(organizationId: string, actorRole: Role, memberId: string) {
    const member = await this.prisma.membership.findFirst({ where: { id: memberId, organizationId } });
    if (!member) throw notFound('Member');
    if (member.role === 'OWNER') {
      if (actorRole !== 'OWNER') throw forbidden('Only owners can remove an owner.');
      await this.assertNotLastOwner(organizationId);
    }
    await this.prisma.membership.delete({ where: { id: memberId } });
    await this.audit.record({
      organizationId,
      action: 'MEMBER_REMOVED',
      resource: 'membership',
      resourceId: memberId,
      metadata: { userId: member.userId, role: member.role },
    });
  }

  async listInvitations(organizationId: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: iso(i.expiresAt),
      createdAt: iso(i.createdAt),
    }));
  }

  async invite(organizationId: string, invitedById: string, email: string, role: Role) {
    const existing = await this.prisma.membership.findFirst({ where: { organizationId, user: { email } } });
    if (existing) throw conflict('This person is already a member.');
    const token = randomToken(24);
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email,
        role,
        invitedById,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
      },
    });
    await this.audit.record({
      organizationId,
      action: 'MEMBER_INVITED',
      resource: 'invitation',
      resourceId: invitation.id,
      metadata: { email, role },
    });
    return {
      id: invitation.id,
      email,
      role,
      expiresAt: iso(invitation.expiresAt),
      createdAt: iso(invitation.createdAt),
      acceptUrl: `${this.env.WEB_URL.replace(/\/$/, '')}/invite/${token}`,
    };
  }

  async revokeInvitation(organizationId: string, invitationId: string) {
    const result = await this.prisma.invitation.updateMany({
      where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw notFound('Invitation');
    await this.audit.record({
      organizationId,
      action: 'INVITATION_REVOKED',
      resource: 'invitation',
      resourceId: invitationId,
    });
  }

  async acceptInvitation(userId: string, token: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw badRequest('This invitation is invalid or has expired. Ask for a new one.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email !== invitation.email) {
      throw forbidden(
        `This invitation was sent to ${invitation.email}. Sign in with that email to accept it.`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: { userId_organizationId: { userId, organizationId: invitation.organizationId } },
        create: { userId, organizationId: invitation.organizationId, role: invitation.role },
        update: {},
      }),
      this.prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    ]);
    await this.audit.record({
      organizationId: invitation.organizationId,
      action: 'MEMBER_JOINED',
      resource: 'membership',
      metadata: { email: user.email, role: invitation.role },
    });
    return this.get(invitation.organizationId, invitation.role);
  }

  private async assertNotLastOwner(organizationId: string) {
    const owners = await this.prisma.membership.count({ where: { organizationId, role: 'OWNER' } });
    if (owners <= 1)
      throw badRequest('An organization needs at least one owner. Promote someone else first.');
  }
}
