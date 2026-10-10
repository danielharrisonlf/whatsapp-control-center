import { ROLES } from '@wacc/types';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { zDate } from '../../common/dto';

const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const RegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email,
    password: z.string().min(12, 'Use at least 12 characters.').max(256),
  })
  .meta({ id: 'RegisterInput' });
export class RegisterDto extends createZodDto(RegisterSchema) {}

export const LoginSchema = z
  .object({ email, password: z.string().min(1).max(256) })
  .meta({ id: 'LoginInput' });
export class LoginDto extends createZodDto(LoginSchema) {}

export const RoleSchema = z.enum(ROLES).meta({ id: 'Role' });

export const MeSchema = z
  .object({
    user: z.object({ id: z.string(), email: z.string(), name: z.string(), createdAt: zDate }),
    memberships: z.array(
      z.object({
        role: RoleSchema,
        organization: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
      }),
    ),
  })
  .meta({ id: 'Me' });
export class MeDto extends createZodDto(MeSchema) {}

export const AuthConfigSchema = z
  .object({
    signupEnabled: z.boolean(),
  })
  .meta({ id: 'AuthConfig' });
export class AuthConfigDto extends createZodDto(AuthConfigSchema) {}
