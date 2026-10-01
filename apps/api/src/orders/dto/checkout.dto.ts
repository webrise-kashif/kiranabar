import { checkoutSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class CheckoutDto extends createZodDto(checkoutSchema) {}
