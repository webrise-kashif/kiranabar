import { updateProductVariantSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class UpdateProductVariantDto extends createZodDto(updateProductVariantSchema) {}
