/**
 * 密保问题预设列表。
 *
 * 前后端共享同一份 key(英文常量)与文案(中文),注册时存 key,验证时显示对应文案。
 * 新增问题只需要在 PREDEFINED_QUESTIONS 末尾追加一行,key 必须保持稳定(一旦上线就不能改/删)。
 */

export interface SecurityQuestion {
  key: string;
  text: string;
}

export const PREDEFINED_QUESTIONS: SecurityQuestion[] = [
  { key: 'first_pet',     text: '你养过的第一只宠物叫什么名字?' },
  { key: 'birth_city',    text: '你出生在哪个城市?' },
  { key: 'mother_name',   text: '你母亲的名字叫什么?' },
  { key: 'favorite_book', text: '你最喜欢的一本书是什么?' },
  { key: 'grade_school',  text: '你上小学时学校的名字是什么?' },
  { key: 'idol',          text: '你小时候的偶像是谁?' },
];

const KEY_TO_TEXT: Record<string, string> = Object.fromEntries(
  PREDEFINED_QUESTIONS.map((q) => [q.key, q.text])
);

export function getQuestionText(key: string | null | undefined): string {
  if (!key) return '';
  return KEY_TO_TEXT[key] ?? '（已下架的问题）';
}
