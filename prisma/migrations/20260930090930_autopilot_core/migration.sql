/*
  Warnings:

  - You are about to drop the column `organizationId` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `budget` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `spend` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Campaign` table. All the data in the column will be lost.
  - The `status` column on the `Campaign` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `keyword` on the `Keyword` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `Keyword` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `organizationId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `reviews` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `action` on the `Recommendation` table. All the data in the column will be lost.
  - You are about to drop the column `entityId` on the `Recommendation` table. All the data in the column will be lost.
  - You are about to drop the column `entityType` on the `Recommendation` table. All the data in the column will be lost.
  - You are about to drop the column `organizationId` on the `Recommendation` table. All the data in the column will be lost.
  - You are about to drop the column `proposedValue` on the `Recommendation` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Recommendation` table. All the data in the column will be lost.
  - The `currentValue` column on the `Recommendation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Recommendation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `productId` on the `SearchTerm` table. All the data in the column will be lost.
  - You are about to drop the column `term` on the `SearchTerm` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[campaignId,value,matchType]` on the table `Keyword` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[campaignId,value]` on the table `SearchTerm` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `amazonAccountId` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `approvalStatus` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `executionResult` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Made the column `reason` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `amazonAccountId` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignType` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dailyBudget` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetingType` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `matchType` to the `Keyword` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Keyword` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `Keyword` table without a default value. This is not possible if the table is not empty.
  - Made the column `campaignId` on table `Keyword` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `Organization` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amazonAccountId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costPerUnit` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sku` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actionType` to the `Recommendation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amazonAccountId` to the `Recommendation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `Recommendation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Recommendation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Recommendation` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `risk` on the `Recommendation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `campaignId` to the `SearchTerm` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SearchTerm` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `SearchTerm` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StrategyMode" AS ENUM ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ENABLED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SearchTermClassification" AS ENUM ('WINNER', 'WASTE', 'NEUTRAL', 'UNDERFUNDED_WINNER', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'APPROVED', 'EXECUTED', 'IGNORED', 'LOCKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('INCREASE_BID', 'DECREASE_BID', 'INCREASE_BUDGET', 'DECREASE_BUDGET', 'HARVEST_KEYWORD', 'ADD_NEGATIVE_KEYWORD', 'LISTING_CHANGE');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_productId_fkey";

-- DropForeignKey
ALTER TABLE "Keyword" DROP CONSTRAINT "Keyword_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Keyword" DROP CONSTRAINT "Keyword_productId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Recommendation" DROP CONSTRAINT "Recommendation_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "SearchTerm" DROP CONSTRAINT "SearchTerm_productId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "organizationId",
DROP COLUMN "status",
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "amazonAccountId" TEXT NOT NULL,
ADD COLUMN     "approvalStatus" TEXT NOT NULL,
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "executionResult" TEXT NOT NULL,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "rawResponse" TEXT,
ADD COLUMN     "recommendationId" TEXT,
ADD COLUMN     "rollbackInfo" TEXT,
ADD COLUMN     "strategyVersion" TEXT,
ALTER COLUMN "reason" SET NOT NULL;

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "budget",
DROP COLUMN "spend",
DROP COLUMN "type",
ADD COLUMN     "acos" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "amazonAccountId" TEXT NOT NULL,
ADD COLUMN     "campaignType" TEXT NOT NULL,
ADD COLUMN     "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "currentSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "dailyBudget" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "roas" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "targetingType" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "productId" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "CampaignStatus" NOT NULL DEFAULT 'ENABLED',
ALTER COLUMN "sales" SET DEFAULT 0,
ALTER COLUMN "orders" SET DEFAULT 0,
ALTER COLUMN "clicks" SET DEFAULT 0,
ALTER COLUMN "impressions" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Keyword" DROP COLUMN "keyword",
DROP COLUMN "productId",
ADD COLUMN     "acos" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "impressions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "matchType" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "value" TEXT NOT NULL,
ALTER COLUMN "campaignId" SET NOT NULL,
ALTER COLUMN "clicks" SET DEFAULT 0,
ALTER COLUMN "orders" SET DEFAULT 0,
ALTER COLUMN "spend" SET DEFAULT 0,
ALTER COLUMN "sales" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "strategyMode" "StrategyMode" NOT NULL DEFAULT 'BALANCED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "name",
DROP COLUMN "organizationId",
DROP COLUMN "rating",
DROP COLUMN "reviews",
ADD COLUMN     "amazonAccountId" TEXT NOT NULL,
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "costPerUnit" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "listingScore" DOUBLE PRECISION NOT NULL DEFAULT 82,
ADD COLUMN     "sku" TEXT NOT NULL,
ADD COLUMN     "targetAcos" DOUBLE PRECISION NOT NULL DEFAULT 0.22,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Recommendation" DROP COLUMN "action",
DROP COLUMN "entityId",
DROP COLUMN "entityType",
DROP COLUMN "organizationId",
DROP COLUMN "proposedValue",
DROP COLUMN "type",
ADD COLUMN     "actionType" "ActionType" NOT NULL,
ADD COLUMN     "amazonAccountId" TEXT NOT NULL,
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "changePercent" DOUBLE PRECISION,
ADD COLUMN     "dataWindow" TEXT,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "expectedImpact" TEXT,
ADD COLUMN     "keywordId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "recommendedValue" DOUBLE PRECISION,
ADD COLUMN     "searchTermId" TEXT,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "risk",
ADD COLUMN     "risk" "RiskLevel" NOT NULL,
DROP COLUMN "currentValue",
ADD COLUMN     "currentValue" DOUBLE PRECISION,
DROP COLUMN "status",
ADD COLUMN     "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "SearchTerm" DROP COLUMN "productId",
DROP COLUMN "term",
ADD COLUMN     "acos" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "classification" "SearchTermClassification" NOT NULL DEFAULT 'NEUTRAL',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "impressions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "value" TEXT NOT NULL,
ALTER COLUMN "clicks" SET DEFAULT 0,
ALTER COLUMN "orders" SET DEFAULT 0,
ALTER COLUMN "spend" SET DEFAULT 0,
ALTER COLUMN "sales" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "AmazonAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "automationLevel" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMetric" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "campaignId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PerformanceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmazonAccount_organizationId_idx" ON "AmazonAccount"("organizationId");

-- CreateIndex
CREATE INDEX "PerformanceMetric_productId_date_idx" ON "PerformanceMetric"("productId", "date");

-- CreateIndex
CREATE INDEX "PerformanceMetric_campaignId_date_idx" ON "PerformanceMetric"("campaignId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_amazonAccountId_createdAt_idx" ON "AuditLog"("amazonAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_recommendationId_idx" ON "AuditLog"("recommendationId");

-- CreateIndex
CREATE INDEX "Campaign_amazonAccountId_idx" ON "Campaign"("amazonAccountId");

-- CreateIndex
CREATE INDEX "Campaign_productId_idx" ON "Campaign"("productId");

-- CreateIndex
CREATE INDEX "Keyword_campaignId_idx" ON "Keyword"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_campaignId_value_matchType_key" ON "Keyword"("campaignId", "value", "matchType");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_amazonAccountId_idx" ON "Product"("amazonAccountId");

-- CreateIndex
CREATE INDEX "Recommendation_amazonAccountId_status_idx" ON "Recommendation"("amazonAccountId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_productId_idx" ON "Recommendation"("productId");

-- CreateIndex
CREATE INDEX "Recommendation_campaignId_idx" ON "Recommendation"("campaignId");

-- CreateIndex
CREATE INDEX "SearchTerm_campaignId_idx" ON "SearchTerm"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchTerm_campaignId_value_key" ON "SearchTerm"("campaignId", "value");

-- AddForeignKey
ALTER TABLE "AmazonAccount" ADD CONSTRAINT "AmazonAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchTerm" ADD CONSTRAINT "SearchTerm_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetric" ADD CONSTRAINT "PerformanceMetric_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetric" ADD CONSTRAINT "PerformanceMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_searchTermId_fkey" FOREIGN KEY ("searchTermId") REFERENCES "SearchTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_amazonAccountId_fkey" FOREIGN KEY ("amazonAccountId") REFERENCES "AmazonAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
