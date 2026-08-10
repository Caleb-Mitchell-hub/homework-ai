'use client';

import { useRouter } from 'next/navigation';
import { RecordSummary } from '@/types';

interface Props {
  record: RecordSummary;
  onViewDetail: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function RecordCard({ record, onViewDetail, onDelete }: Props) {
  const router = useRouter();
  const isDraft = record.status === 'draft';
  const percentage = record.totalScore > 0
    ? Math.round((record.score / record.totalScore) * 100)
    : 0;

  const pctColor =
    percentage >= 80 ? 'text-emerald-500' :
    percentage >= 60 ? 'text-amber-500' :
    'text-rose-500';

  const barColor =
    percentage >= 80 ? 'bg-emerald-400' :
    percentage >= 60 ? 'bg-amber-400' :
    'bg-rose-400';

  const hasSubjective = record.summary.subjectiveCount > 0;

  return (
    <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/60 hover:border-sky-300 hover:shadow-sm transition-all">
      {/* 题库名 + 状态标签 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px]">📋</span>
          <span className="text-[13px] font-medium text-slate-800 truncate">
            {record.quiz?.title || '未知题库'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isDraft ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-600 font-medium">
              草稿
            </span>
          ) : (
            <span className={`text-[14px] font-bold tabular-nums ${pctColor}`}>
              {percentage}%
            </span>
          )}
        </div>
      </div>

      {/* 记录名 + 时间 */}
      <div className="text-[11px] text-slate-500 mb-2">
        {record.name} · {new Date(record.submittedAt).toLocaleString('zh-CN')}
      </div>

      {/* 进度条（已提交）+ 统计 */}
      {!isDraft && (
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{record.score}/{record.totalScore}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
          {hasSubjective && (
            <div className="text-[10px] text-slate-400">
              主观题均分 {record.summary.subjectiveAvgScore} · {record.summary.objectiveCount}客观 + {record.summary.subjectiveCount}主观
            </div>
          )}
        </div>
      )}

      {/* 草稿状态 */}
      {isDraft && (
        <div className="text-[11px] text-amber-600 mb-3">
          已完成 {record.summary.totalQuestions > 0 ? `${record.summary.totalQuestions} 题` : '部分题目'}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 text-[11px]">
        {isDraft ? (
          <button
            onClick={() => router.push(`/quiz/${record.quizId}`)}
            className="px-3 py-1.5 rounded-lg bg-sky-400 text-white hover:bg-sky-500 transition-colors"
          >
            继续答题
          </button>
        ) : (
          <>
            <button
              onClick={() => onViewDetail(record.id)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              查看详情
            </button>
            <button
              onClick={() => router.push(`/result/${record.id}/report`)}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
            >
              查看报告
            </button>
          </>
        )}
        {/* 更多菜单 */}
        <div className="relative ml-auto group/more">
          <button className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            ⋮
          </button>
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover/more:opacity-100 group-hover/more:visible transition-all z-10 py-1 min-w-[100px]">
            <button
              onClick={() => onDelete(record.id)}
              className="block w-full text-left px-3 py-1.5 text-[11px] text-rose-500 hover:bg-rose-50 transition-colors"
            >
              删除记录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
