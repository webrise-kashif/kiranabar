import { refreshTokenBodySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class RefreshDto extends createZodDto(refreshTokenBodySchema) {}
