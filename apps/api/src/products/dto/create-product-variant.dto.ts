import { createProductVariantSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class CreateProductVariantDto extends createZodDto(createProductVariantSchema) {}
