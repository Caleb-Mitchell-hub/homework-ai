-- CreateTable
CREATE TABLE `AIProviderConfig` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `baseURL` VARCHAR(191) NOT NULL,
    `apiKeyCipher` TEXT NOT NULL,
    `apiKeyLast4` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `visionModel` VARCHAR(191) NULL,
    `supportsVision` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AIProviderConfig_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
