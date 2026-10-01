import { changeUserRoleSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class ChangeUserRoleDto extends createZodDto(changeUserRoleSchema) {}
