import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runReview } from "./review.server";

const Input = z.object({ code: z.string().min(1).max(20000) });

export const reviewPython = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => runReview(data.code));
