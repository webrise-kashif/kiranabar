import { createProductImageSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class CreateProductImageDto extends createZodDto(createProductImageSchema) {}
