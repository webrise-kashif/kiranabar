import { updateCategorySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
