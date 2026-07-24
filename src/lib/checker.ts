import { Question, Answer, QuizResult } from '@/types';

interface CheckResult {
  questionId: string;
  correct: boolean;
  correctAnswer: string;
  userAnswer: string;
  autoGraded: boolean;
  score: number;
}

export function checkAnswer(question: Question, userAnswer: string): CheckResult {
  const base = {
    questionId: question.id,
    correctAnswer: question.answer,
    userAnswer,
    autoGraded: true,
    score: 0
  };

  switch (question.type) {
    case 'single': {
      const correct = userAnswer.trim().toUpperCase() === question.correctAnswer.trim().toUpperCase();
      return { ...base, correct, score: correct ? 1 : 0, autoGraded: true };
    }

    case 'multiple': {
      const userSet = new Set(userAnswer.trim().toUpperCase().split('').filter(c => /[A-D]/.test(c)).sort());
      const correctSet = new Set(question.correctAnswer.trim().toUpperCase().split('').filter(c => /[A-D]/.test(c)).sort());
      const correct = userSet.size === correctSet.size && [...userSet].every(c => correctSet.has(c));
      return { ...base, correct, score: correct ? 1 : 0, autoGraded: true };
    }

    case 'boolean': {
      const normalized = userAnswer.trim().toLowerCase();
      const isTrue = normalized === 'true' || normalized === '对' || normalized === '正确' || normalized === '是' || normalized === '1';
      const correct = (isTrue && question.correctAnswer === 'true') || (!isTrue && question.correctAnswer === 'false');
      return { ...base, correct, score: correct ? 1 : 0, autoGraded: true };
    }

    case 'fill': {
      const userAnswers = userAnswer.split(/[，,;；]/).map(s => s.trim()).filter(Boolean);
      const correctAnswers = question.correctAnswer.split(/[，,;；]/).map(s => s.trim()).filter(Boolean);
      let correctCount = 0;
      for (const ua of userAnswers) {
        if (correctAnswers.some(ca => ca.includes(ua) || ua.includes(ca))) {
          correctCount++;
        }
      }
      const score = correctAnswers.length > 0 ? Math.round((correctCount / correctAnswers.length) * 10) / 10 : 0;
      const correct = score === 1;
      return { ...base, correct, score, autoGraded: true };
    }

    case 'essay':
      return { ...base, correct: false, score: 0, autoGraded: false };

    case 'code':
    case 'interview':
      return { ...base, correct: false, score: 0, autoGraded: false };

    default:
      return { ...base, correct: false, score: 0, autoGraded: true };
  }
}

export function gradeQuiz(questions: Question[], answers: Answer[]): QuizResult {
  let totalScore = 0;
  let totalMaxScore = questions.length;
  const results: CheckResult[] = [];

  for (const question of questions) {
    const answer = answers.find(a => a.questionId === question.id);
    const userAnswer = answer?.answer || '';
    const result = checkAnswer(question, userAnswer);
    results.push(result);
    // 客观题 result.score 是 0/1,主观题始终 0。
    // 主观题 manualScore 在 Admin 改分时由 /api/admin/results/[id]/grade 重算并写入。
    totalScore += result.score;
  }

  return {
    quizId: questions[0]?.id || '',
    answers,
    score: totalScore,
    totalScore: totalMaxScore,
    results: results.map(r => ({ ...r, score: undefined })) as QuizResult['results'],
    submittedAt: Date.now()
  } as QuizResult;
}