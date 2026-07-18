import { z } from "zod";

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().min(1).max(16).default("💰"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex color")
    .default("#4f6df5"),
  startingBalanceMinor: z.number().int().default(0),
});

export type AccountCreate = z.infer<typeof accountCreateSchema>;

export interface Account {
  id: number;
  name: string;
  icon: string;
  color: string;
  startingBalanceMinor: number;
  archived: boolean;
  sortOrder: number;
}
