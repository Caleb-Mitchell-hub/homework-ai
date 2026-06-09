-- 为 Quiz 表增加题库分类字段
ALTER TABLE `Quiz` ADD COLUMN `categoryId` VARCHAR(64) NULL;
CREATE INDEX `Quiz_categoryId_idx` ON `Quiz`(`categoryId`);
