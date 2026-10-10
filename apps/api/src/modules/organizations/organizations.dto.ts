import { ROLES } from '@wacc/types';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { zDate, zDateNullable } from '../../common/dto';
import { RoleSchema } from '../auth/auth.dto';

export const OrganizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: RoleSchema,
    createdAt: zDate,
  })
  .meta({ id: 'Organization' });
export class OrganizationDto extends createZodDto(OrganizationSchema) {}
export class OrganizationListDto extends createZodDto(
  z.array(OrganizationSchema).meta({ id: 'OrganizationList' }),
) {}

export class CreateOrganizationDto extends createZodDto(
  z.object({ name: z.string().trim().min(2).max(80) }).meta({ id: 'CreateOrganizationInput' }),
) {}
export class UpdateOrganizationDto extends createZodDto(
  z.object({ name: z.string().trim().min(2).max(80) }).meta({ id: 'UpdateOrganizationInput' }),
) {}

export const MemberSchema = z
  .object({
    id: z.string(),
    role: RoleSchema,
    user: z.object({ id: z.string(), name: z.string(), email: z.string(), lastLoginAt: zDateNullable }),
    createdAt: zDate,
  })
  .meta({ id: 'Member' });
export class MemberDto extends createZodDto(MemberSchema) {}
export class MemberListDto extends createZodDto(z.array(MemberSchema).meta({ id: 'MemberList' })) {}

export class UpdateMemberDto extends createZodDto(
  z.object({ role: z.enum(ROLES) }).meta({ id: 'UpdateMemberInput' }),
) {}

export const InvitationSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    role: RoleSchema,
    expiresAt: zDate,
    createdAt: zDate,
  })
  .meta({ id: 'Invitation' });
export class InvitationListDto extends createZodDto(
  z.array(InvitationSchema).meta({ id: 'InvitationList' }),
) {}

export class CreateInvitationDto extends createZodDto(
  z
    .object({
      email: z.email().transform((v) => v.trim().toLowerCase()),
      role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']),
    })
    .meta({ id: 'CreateInvitationInput' }),
) {}

export class CreatedInvitationDto extends createZodDto(
  InvitationSchema.extend({
    acceptUrl: z.string().describe('Shown once. Share it with the invitee; only its hash is stored.'),
  }).meta({ id: 'CreatedInvitation' }),
) {}

export class AcceptInvitationDto extends createZodDto(
  z.object({ token: z.string().min(20).max(200) }).meta({ id: 'AcceptInvitationInput' }),
) {}
