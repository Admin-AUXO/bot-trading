import { Prisma } from "@prisma/client";

export function toJsonValue(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return JSON.parse(JSON.stringify(value));
}
