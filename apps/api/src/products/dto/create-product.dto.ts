import { createProductSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class CreateProductDto extends createZodDto(createProductSchema) {}
