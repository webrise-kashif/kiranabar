import { updateProductSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class UpdateProductDto extends createZodDto(updateProductSchema) {}
