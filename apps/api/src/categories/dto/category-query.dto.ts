import { categoryQuerySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class CategoryQueryDto extends createZodDto(categoryQuerySchema) {}
