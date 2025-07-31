import z from 'zod';

export const configSchema = z.object({
  dashboard: z.object({
    organizationName: z.string().min(1),
    projectName: z.string().min(1),
  }),
  auth: z.object({
    disableSignup: z.boolean().default(false),
    jwtExpiryLimit: z.number().default(3600),
    passwordMinLength: z.number().default(8),
  }),
  email: z.object({
    senderAddress: z.string().min(1),
    senderName: z.string().min(1),
  }),
  planetscale: z.object({
    host: z.string().min(1),
    port: z.number(),
    user: z.string().min(1),
    password: z.string().min(1),
    database: z.string().min(1),
    branchId: z.string().min(1),
  }),
  openai: z.object({
    apiKey: z.string().nullable().optional(),
  }).nullable().optional(),
});

export type Config = z.infer<typeof configSchema>;
