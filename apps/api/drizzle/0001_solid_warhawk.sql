ALTER TYPE "public"."transaction_type" ADD VALUE 'lend';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'collect';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'borrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'repay';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'adjustment';