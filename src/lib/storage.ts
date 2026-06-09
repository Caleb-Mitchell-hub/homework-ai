import { Quiz, QuizResult } from '@/types';

const QUIZZES_KEY = 'quizzes';
const RESULTS_KEY = 'quiz_results';

export function saveQuiz(quiz: Quiz): void {
  const quizzes = getQuizzes();
  const existingIndex = quizzes.findIndex(q => q.id === quiz.id);
  if (existingIndex >= 0) {
    quizzes[existingIndex] = quiz;
  } else {
    quizzes.push(quiz);
  }
  localStorage.setItem(QUIZZES_KEY, JSON.stringify(quizzes));
}

export function getQuizzes(): Quiz[] {
  const data = localStorage.getItem(QUIZZES_KEY);
  return data ? JSON.parse(data) : [];
}

export function getQuiz(id: string): Quiz | undefined {
  return getQuizzes().find(q => q.id === id);
}

export function deleteQuiz(id: string): void {
  const quizzes = getQuizzes().filter(q => q.id !== id);
  localStorage.setItem(QUIZZES_KEY, JSON.stringify(quizzes));
}

export function saveResult(result: QuizResult): void {
  const results = getResults();
  results.push(result);
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

export function getResults(): QuizResult[] {
  const data = localStorage.getItem(RESULTS_KEY);
  return data ? JSON.parse(data) : [];
}

export function getResultsByQuiz(quizId: string): QuizResult[] {
  return getResults().filter(r => r.quizId === quizId);
}

export function deleteResult(quizId: string): void {
  const results = getResults().filter(r => r.quizId !== quizId);
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

export function deleteResults(ids: string[]): void {
  const results = getResults().filter(r => !ids.includes(r.quizId + '-' + r.submittedAt));
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

export function updateResult(result: QuizResult): void {
  const results = getResults();
  const index = results.findIndex(r => r.quizId + '-' + r.submittedAt === result.quizId + '-' + result.submittedAt);
  if (index >= 0) {
    results[index] = result;
  } else {
    results.push(result);
  }
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}