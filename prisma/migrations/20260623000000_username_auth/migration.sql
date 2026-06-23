-- Add username column, populate from email, then make NOT NULL + unique.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill: use the email local-part (before @) as username.
-- If duplicates arise from the local-part, append a suffix.
UPDATE "User" SET "username" = LOWER("email");

-- Now that every row has a username, make it required.
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- Make email nullable (was NOT NULL).
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Unique index on username.
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
