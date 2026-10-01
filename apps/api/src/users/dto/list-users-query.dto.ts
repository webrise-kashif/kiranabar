import { paginationQuerySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class ListUsersQueryDto extends createZodDto(paginationQuerySchema) {}
