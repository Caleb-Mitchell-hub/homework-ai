export type QuestionType = 'single' | 'multiple' | 'boolean' | 'fill' | 'essay' | 'code';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  title: string;
  answer: string;
  /** 题目解析（管理员手动表单带入，可选） */
  analysis?: string;
  /** 题目分值（管理员手动表单带入，可选） */
  score?: number;
}

export interface SingleQuestion extends BaseQuestion {
  type: 'single';
  options: string[];
  correctAnswer: string;
}

export interface MultipleQuestion extends BaseQuestion {
  type: 'multiple';
  options: string[];
  correctAnswer: string;
}

export interface BooleanQuestion extends BaseQuestion {
  type: 'boolean';
  correctAnswer: 'true' | 'false';
}

export interface FillQuestion extends BaseQuestion {
  type: 'fill';
  blanks: number;
  correctAnswer: string;
}

export interface EssayQuestion extends BaseQuestion {
  type: 'essay';
  referenceAnswer: string;
}

export interface CodeQuestion extends BaseQuestion {
  type: 'code';
  code: string;
  language: string;
  inputExample: string;
  outputExample: string;
}

export type Question = SingleQuestion | MultipleQuestion | BooleanQuestion | FillQuestion | EssayQuestion | CodeQuestion;

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
  createdAt: number;
  /** 答题时长（分钟），0 / undefined = 不限时 */
  timeLimit?: number;
  /** 文件内容 SHA-256 指纹(后端字段,前端可空) */
  fileKey?: string | null;
  /** 用户首次保存时设定的记录名(后续可改,作为暂存/提交默认值) */
  defaultName?: string | null;
  /** 默认归档分类 id(对应 CategoryContext localStorage 里的 Category.id) */
  defaultCategoryId?: string | null;
}

export interface Answer {
  questionId: string;
  answer: string;
}

export interface QuizResult {
  quizId: string;
  name: string;
  status: 'draft' | 'submitted';
  answers: Answer[];
  score: number;
  totalScore: number;
  results: {
    questionId: string;
    correct: boolean;
    correctAnswer: string;
    userAnswer: string;
    autoGraded: boolean;
  }[];
  submittedAt: number;
}