import { productQuerySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class ProductQueryDto extends createZodDto(productQuerySchema) {}
