import { cartItemVariantQuerySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class CartItemVariantQueryDto extends createZodDto(cartItemVariantQuerySchema) {}
