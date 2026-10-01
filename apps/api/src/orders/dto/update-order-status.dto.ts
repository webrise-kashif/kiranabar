import { updateOrderStatusSchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class UpdateOrderStatusDto extends createZodDto(updateOrderStatusSchema) {}
