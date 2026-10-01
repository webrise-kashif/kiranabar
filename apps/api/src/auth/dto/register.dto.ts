import { registerSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class RegisterDto extends createZodDto(registerSchema) {}
