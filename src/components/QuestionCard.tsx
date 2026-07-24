'use client';

import { Highlight, themes } from 'prism-react-renderer';
import { Question, SingleQuestion, MultipleQuestion, BooleanQuestion, FillQuestion, EssayQuestion, CodeQuestion, InterviewQuestion } from '@/types';
import MarkdownView from '@/components/MarkdownView';
import AIFollowUp from '@/components/AIFollowUp';

interface Props {
  question: Question;
  index: number;
  userAnswer: string;
  onChange: (questionId: string, answer: string) => void;
  showResult?: boolean;
}

const typeColors: Record<Question['type'], { bg: string; text: string; border: string }> = {
  single: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
  multiple: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
  boolean: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  fill: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  essay: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200' },
  code: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200' },
  interview: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' }
};

const typeLabels: Record<Question['type'], string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  fill: '填空题',
  essay: '简答题',
  code: '代码题',
  interview: '面试题'
};

export default function QuestionCard({ question, index, userAnswer, onChange, showResult }: Props) {
  const colors = typeColors[question.type];

  const renderInput = () => {
    switch (question.type) {
      case 'single': {
        const q = question as SingleQuestion;
        return (
          <div className="space-y-3">
            {q.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = userAnswer.toUpperCase() === letter;
              return (
                <label
                  key={i}
                  className={`flex items-center p-4 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-sky-50 border-sky-300'
                      : 'bg-white border-slate-200 hover:bg-sky-50/50 hover:border-sky-300'
                  } ${showResult ? 'pointer-events-none' : ''}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm mr-4 transition-colors ${
                    isSelected ? 'bg-sky-400 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {letter}
                  </span>
                  <span className="flex-1 text-slate-700"><MarkdownView content={opt} size="base" /></span>
                  <input
                    type="radio"
                    name={question.id}
                    value={letter}
                    checked={isSelected}
                    onChange={() => onChange(question.id, letter)}
                    disabled={showResult}
                    className="hidden"
                  />
                </label>
              );
            })}
          </div>
        );
      }

      case 'multiple': {
        const q = question as MultipleQuestion;
        const selected = new Set(userAnswer.toUpperCase().split('').filter(c => /[A-D]/.test(c)));
        return (
          <div className="space-y-3">
            {q.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = selected.has(letter);
              return (
                <label
                  key={i}
                  className={`flex items-center p-4 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-violet-50 border-violet-300'
                      : 'bg-white border-slate-200 hover:bg-violet-50/50 hover:border-violet-300'
                  } ${showResult ? 'pointer-events-none' : ''}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm mr-4 transition-colors ${
                    isSelected ? 'bg-violet-400 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {letter}
                  </span>
                  <span className="flex-1 text-slate-700"><MarkdownView content={opt} size="base" /></span>
                  <input
                    type="checkbox"
                    value={letter}
                    checked={isSelected}
                    onChange={(e) => {
                      const newSet = new Set(selected);
                      if (e.target.checked) {
                        newSet.add(letter);
                      } else {
                        newSet.delete(letter);
                      }
                      onChange(question.id, [...newSet].sort().join(''));
                    }}
                    disabled={showResult}
                    className="hidden"
                  />
                </label>
              );
            })}
          </div>
        );
      }

      case 'boolean':
        return (
          <div className="flex gap-4">
            {[
              { val: 'true', label: '正确', icon: '✓' },
              { val: 'false', label: '错误', icon: '✗' }
            ].map(opt => (
              <label
                key={opt.val}
                className={`flex-1 flex items-center justify-center p-4 rounded-xl cursor-pointer transition-all border ${
                  userAnswer === opt.val
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-white border-slate-200 hover:bg-amber-50/50 hover:border-amber-300'
                } ${showResult ? 'pointer-events-none' : ''}`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={opt.val}
                  checked={userAnswer === opt.val}
                  onChange={() => onChange(question.id, opt.val)}
                  disabled={showResult}
                  className="hidden"
                />
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold mr-3 transition-colors ${
                  userAnswer === opt.val ? 'bg-amber-400 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                }`}>
                  {opt.icon}
                </span>
                <span className="text-slate-700 font-medium">{opt.label}</span>
              </label>
            ))}
          </div>
        );

      case 'fill': {
        const q = question as FillQuestion;
        return (
          <div>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => onChange(question.id, e.target.value)}
              disabled={showResult}
              placeholder={`用分号或逗号分隔${q.blanks > 1 ? `${q.blanks}个` : ''}答案`}
              className="w-full p-4 bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </div>
        );
      }

      case 'essay':
        return (
          <textarea
            value={userAnswer}
            onChange={(e) => onChange(question.id, e.target.value)}
            disabled={showResult}
            rows={5}
            placeholder="请输入您的答案..."
            className="w-full p-4 bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 resize-none"
          />
        );

      case 'interview': {
        const q = question as InterviewQuestion;
        return (
          <div className="space-y-3">
            {Array.isArray(q.subQuestions) && q.subQuestions.length > 0 && (
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3">
                <div className="text-[10.5px] tracking-[0.2em] uppercase text-indigo-400 mb-2">
                  📋 面试要点
                </div>
                <ol className="space-y-1.5 list-decimal list-inside text-[13px] text-slate-700">
                  {q.subQuestions.map((sub, i) => (
                    <li key={i} className="leading-relaxed">
                      <MarkdownView content={sub} size="base" />
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <textarea
              value={userAnswer}
              onChange={(e) => onChange(question.id, e.target.value)}
              disabled={showResult}
              rows={6}
              placeholder="请写下你的思路 / 经验 / 代码示例…"
              className="w-full p-4 bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 resize-none"
            />
          </div>
        );
      }

      case 'code': {
        const q = question as CodeQuestion;
        return (
          <div className="space-y-4">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-slate-500 text-sm">代码：</span>
                <span className="px-2 py-0.5 rounded bg-cyan-50 text-cyan-600 text-xs">{q.language || 'python'}</span>
              </div>
              <Highlight theme={themes.nightOwl} code={q.code || ''} language="python">
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre className={`${className} p-4 bg-slate-900 border border-slate-700 rounded-xl overflow-x-auto text-sm`} style={style}>
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
            {q.inputExample && (
              <div className="mb-3 flex items-center gap-2 text-sm">
                <span className="text-slate-500">输入：</span>
                <code className="px-2 py-1 bg-amber-50 rounded text-amber-700 font-mono border border-amber-200">{q.inputExample}</code>
              </div>
            )}
            {q.outputExample && (
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="text-slate-500">输出：</span>
                <code className="px-2 py-1 bg-emerald-50 rounded text-emerald-700 font-mono border border-emerald-200">{q.outputExample}</code>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-slate-500 text-sm">你的答案（Python代码）：</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <textarea
                  value={userAnswer}
                  onChange={(e) => onChange(question.id, e.target.value)}
                  disabled={showResult}
                  rows={12}
                  placeholder="请输入Python代码..."
                  className="w-full p-4 bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 font-mono text-sm resize-none"
                />
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 text-xs text-slate-500">代码预览</div>
                  <div className="p-2 bg-white overflow-auto" style={{ maxHeight: '300px' }}>
                    {userAnswer ? (
                      <Highlight theme={themes.nightOwl} code={userAnswer} language="python">
                        {({ className, style, tokens, getLineProps, getTokenProps }) => (
                          <pre className={`${className} text-sm`} style={style}>
                            {tokens.map((line, i) => (
                              <div key={i} {...getLineProps({ line })}>
                                {line.map((token, key) => (
                                  <span key={key} {...getTokenProps({ token })} />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    ) : (
                      <div className="text-slate-400 text-sm p-2">输入代码后预览将显示在这里</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div
      id={`q-${question.id}`}
      className={`border ${colors.border} rounded-2xl p-6 mb-6 bg-white/80 shadow-sm`}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center text-white font-bold shadow-sm">
            {index + 1}
          </span>
          <span className={`px-3 py-1 rounded-lg text-sm font-medium ${colors.bg} ${colors.text}`}>
            {typeLabels[question.type]}
          </span>
        </div>
        {showResult && (
          <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
            userAnswer ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
          }`}>
            {userAnswer ? '已作答' : '未作答'}
          </span>
        )}
      </div>

      <div className="mb-6 text-slate-800 text-left">
        <MarkdownView content={question.title} size="lg" />
      </div>

      {renderInput()}

      {showResult && question.type === 'interview' && (question as InterviewQuestion).referenceAnswer && (
        <div className="mt-5 p-4 bg-indigo-50/50 rounded-xl border border-indigo-200">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-indigo-600 font-medium">💡 参考思路</span>
          </div>
          <div className="text-slate-700">
            <MarkdownView content={(question as InterviewQuestion).referenceAnswer} size="base" />
          </div>
        </div>
      )}

      {showResult && question.type !== 'code' && question.type !== 'essay' && question.type !== 'interview' && (
        <div className="mt-5 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-emerald-600 font-medium">正确答案</span>
          </div>
          <div className="text-slate-700">
            <MarkdownView content={String(question.answer)} size="base" />
          </div>
        </div>
      )}

      {/* 追问入口 */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <AIFollowUp
          questionId={question.id}
          questionContent={question.title}
          questionType={question.type}
        />
      </div>
    </div>
  );
}
