import { updateCartItemSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class UpdateCartItemDto extends createZodDto(updateCartItemSchema) {}
