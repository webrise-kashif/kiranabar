import { createCategorySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
