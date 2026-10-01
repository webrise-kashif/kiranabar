import { addCartItemSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class AddCartItemDto extends createZodDto(addCartItemSchema) {}
