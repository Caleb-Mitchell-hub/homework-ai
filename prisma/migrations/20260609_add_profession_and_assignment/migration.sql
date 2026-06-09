-- CreateTable
CREATE TABLE `Profession` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Profession_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuizAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `quizId` VARCHAR(191) NOT NULL,
    `professionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `QuizAssignment_quizId_professionId_userId_key`(`quizId`, `professionId`, `userId`),
    INDEX `QuizAssignment_professionId_idx`(`professionId`),
    INDEX `QuizAssignment_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD COLUMN `professionId` VARCHAR(191) NULL;
ALTER TABLE `User` ADD CONSTRAINT `User_professionId_fkey` FOREIGN KEY (`professionId`) REFERENCES `Profession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizAssignment` ADD CONSTRAINT `QuizAssignment_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuizAssignment` ADD CONSTRAINT `QuizAssignment_professionId_fkey` FOREIGN KEY (`professionId`) REFERENCES `Profession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuizAssignment` ADD CONSTRAINT `QuizAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
