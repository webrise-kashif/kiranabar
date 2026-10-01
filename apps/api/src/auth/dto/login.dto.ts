import { loginSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class LoginDto extends createZodDto(loginSchema) {}
