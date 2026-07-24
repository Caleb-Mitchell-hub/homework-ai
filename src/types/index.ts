export type QuestionType = 'single' | 'multiple' | 'boolean' | 'fill' | 'essay' | 'code' | 'interview';

export type Difficulty = '简单' | '中等' | '困难';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  title: string;
  answer: string;
  /** 题目解析（管理员手动表单带入，可选） */
  analysis?: string;
  /** 题目分值（管理员手动表单带入，可选） */
  score?: number;
  /** 难度,可选;没有默认'中等' */
  difficulty?: Difficulty;
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

/**
 * 面试题: 主观表达题,通常包含多个要点/场景问题
 * - 不强制单一答案,有参考答案作参考
 * - 默认按"已作答"计分,真实评判交给面试官
 */
export interface InterviewQuestion extends BaseQuestion {
  type: 'interview';
  /** 面试要点提示 (markdown 格式,展示给用户/面试官) */
  referenceAnswer: string;
  /** 子问题列表 (可选,展示为"问 1/2/3") */
  subQuestions?: string[];
}

export type Question = SingleQuestion | MultipleQuestion | BooleanQuestion | FillQuestion | EssayQuestion | CodeQuestion | InterviewQuestion;

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
  /** 服务端 QuizResult.id,前端有时候拿不到;详情页/报告页用 */
  id?: string;
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
    /** AI 自动批评语 */
    aiComment?: string;
    /** 人工分数 0~1 */
    manualScore?: number;
    /** 人工评语 */
    manualComment?: string;
    /** 批阅人 admin userId */
    manualGradedBy?: string;
    /** 批阅时间 ISO */
    manualGradedAt?: string;
  }[];
  submittedAt: number;
}