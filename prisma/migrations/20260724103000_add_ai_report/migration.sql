-- AlterTable
ALTER TABLE `CreditLedger` MODIFY `reason` ENUM('signup', 'daily_signin', 'topup', 'admin_adjust', 'ai_explain', 'ai_report', 'refund') NOT NULL;

-- CreateTable
CREATE TABLE `AIReport` (
    `id` VARCHAR(191) NOT NULL,
    `resultId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `costCredit` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AIReport_resultId_key`(`resultId`),
    INDEX `AIReport_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AIReport` ADD CONSTRAINT `AIReport_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `QuizResult`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIReport` ADD CONSTRAINT `AIReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

