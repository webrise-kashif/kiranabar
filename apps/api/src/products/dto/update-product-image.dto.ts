import { updateProductImageSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class UpdateProductImageDto extends createZodDto(updateProductImageSchema) {}
