-- AlterTable
ALTER TABLE `User`
  ADD COLUMN `securityQuestion` VARCHAR(64) NULL,
  ADD COLUMN `securityAnswerHash` VARCHAR(255) NULL;
