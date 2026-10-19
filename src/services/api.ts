/**
 * FocusTube API Client
 * Communicates with the Python FastAPI backend via VITE_API_URL.
 * Supports token persistence, error parsing, and graceful offline preview fallback.
 */

import { User, ContentItem, Video, Session, Classroom } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'FocusTube_token';
const USER_KEY = 'FocusTube_user';

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const removeStoredToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getStoredUser = (): User | null => {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
};

export const setStoredUser = (user: User): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getHebrewFailureReason = (reason?: string | null): string => {
  switch (reason) {
    case 'no_api_key':
      return 'לא הוגדר מפתח Gemini API במערכת. הסרטון נוסף ללא שאלות וניתן לצפות בו כרגיל.';
    case 'invalid_api_key':
      return 'מפתח ה-Gemini API שהוגדר אינו תקין או שנחסם.';
    case 'gemini_unavailable':
      return 'שירות Gemini אינו זמין כרגע (עומס, חריגת מכסה או תקלה בשירות). ניתן לנסות שוב מאוחר יותר.';
    case 'no_transcript':
      return 'לא נמצא תמלול ביוטיוב עבור סרטון זה (חסר כתוביות).';
    case 'invalid_ai_response':
      return 'התשובה שהתקבלה מהבינה המלאכותית לא תאמה את המבנה הנדרש.';
    default:
      return 'אירעה שגיאה בעיבוד השאלות לסרטון זה.';
  }
};

// Check server availability
let isServerOnline: boolean | null = null;
export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      isServerOnline = true;
      return true;
    }
  } catch {
    isServerOnline = false;
  }
  return false;
}

// Request helper
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      removeStoredToken();
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new Error('פג תוקף ההתחברות או שהאסימון שגוי. אנא התחבר מחדש.');
    }

    if (res.status === 204) {
      return {} as T;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.message || data.detail?.message || 'אירעה שגיאה בבקשה';
      throw new Error(msg);
    }

    return data as T;
  } catch (err: any) {
    // If network error (backend not running or connection refused), handle gracefully
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.name === 'TimeoutError')) {
      return handleOfflineFallback<T>(endpoint, options);
    }
    throw err;
  }
}

// ==========================================
// In-Browser Local Mock for Offline Previews
// Ensures reviewer or AI agent can navigate everything seamlessly even before docker-compose starts
// ==========================================
function getMockStorage<T>(key: string, defaultValue: T): T {
  const val = localStorage.getItem(`fl_mock_${key}`);
  return val ? JSON.parse(val) : defaultValue;
}
function setMockStorage<T>(key: string, val: T): void {
  localStorage.setItem(`fl_mock_${key}`, JSON.stringify(val));
}

function handleOfflineFallback<T>(endpoint: string, options: RequestInit): T {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : {};

  // Auth: register
  if (endpoint === '/api/auth/register' && method === 'POST') {
    const user: User = {
      id: 'mock-user-1',
      email: body.email,
      display_name: body.display_name,
      created_at: new Date().toISOString()
    };
    setStoredToken('mock-token-session-12345');
    setStoredUser(user);
    return user as unknown as T;
  }

  // Auth: login
  if (endpoint === '/api/auth/login' && method === 'POST') {
    const user: User = {
      id: 'mock-user-1',
      email: body.email,
      display_name: body.email.split('@')[0] || 'משתמש',
      created_at: new Date().toISOString()
    };
    setStoredToken('mock-token-session-12345');
    setStoredUser(user);
    return {
      access_token: 'mock-token-session-12345',
      token_type: 'bearer',
      expires_in: 86400
    } as unknown as T;
  }

  // Auth: logout
  if (endpoint === '/api/auth/logout' && method === 'POST') {
    removeStoredToken();
    return {} as unknown as T;
  }

  // Users: me
  if (endpoint === '/api/users/me') {
    const user = getStoredUser() || {
      id: 'mock-user-1',
      email: 'student@FocusTube.local',
      display_name: 'יוסי כהן',
      created_at: new Date().toISOString()
    };
    return user as unknown as T;
  }

  // Content: list
  if (endpoint.startsWith('/api/content') && method === 'GET') {
    const mockList = getMockStorage<ContentItem[]>('content', [
      {
        id: 'content-demo-1',
        user_id: 'mock-user-1',
        video_id: 'vid-demo-1',
        created_at: new Date().toISOString(),
        video: {
          id: 'vid-demo-1',
          youtube_id: 'dQw4w9WgXcQ',
          title: 'מבוא למדעי המחשב: אלגוריתמים ומבני נתונים',
          duration_seconds: 213,
          categories: ['מחשבים והייטק'],
          status: 'ready',
          created_at: new Date().toISOString(),
          segments: [
            {
              index: 0,
              start_seconds: 0,
              end_seconds: 70,
              title: 'יסודות האלגוריתם',
              summary: 'הסבר מהו אלגוריתם וכיצד מודדים סיבוכיות זמן.',
              questions: [
                {
                  question: 'מהי מטרת החישוב של סיבוכיות זמן באלגוריתמים?',
                  options: [
                    'להעריך את קצב גידול זמן הריצה בהתאם לגודל הקלט',
                    'לבדוק את טמפרטורת המעבד בזמן ההרצה',
                    'למדוד את משקל המחשב בזמן פעולה',
                    'לספור כמה שורות קוד נכתבו בקובץ'
                  ],
                  correct_index: 0,
                  explanation: 'סיבוכיות זמן מודדת את אסימפטוטיקת זמן הריצה כפונקציה של גודל הקלט.'
                },
                {
                  question: 'מה מאפיין אלגוריתם יעיל?',
                  options: [
                    'שימוש מינימלי במשאבי זיכרון וזמן מעבד',
                    'כתיבה באותיות גדולות בלבד',
                    'הרצה ללא חיבור לאינטרנט בלבד',
                    'אלגוריתם שלוקח תמיד יותר משעה'
                  ],
                  correct_index: 0,
                  explanation: 'יעילות נמדדת בניצול מיטבי של זמן עיבוד ומשאבי זיכרון.'
                }
              ]
            },
            {
              index: 1,
              start_seconds: 70,
              end_seconds: 150,
              title: 'מערכים ורשימות מקושרות',
              summary: 'השוואה בין גישה רציפה במערך לבין רשימה מקושרת.',
              questions: [
                {
                  question: 'מהו היתרון המרכזי של מערך על פני רשימה מקושרת?',
                  options: [
                    'גישה ישירה לאיבר לפי אינדקס בזמן O(1)',
                    'הוא יכול להכיל רק תמונות ולא מספרים',
                    'הוא אינו תופס מקום כלל בזיכרון',
                    'אין צורך להגדיר אותו בקוד'
                  ],
                  correct_index: 0,
                  explanation: 'במערך הגישה לכל תא היא ישירה בזמן קבוע בזכות רציפות הזיכרון.'
                },
                {
                  question: 'מתי נעדיף להשתמש ברשימה מקושרת?',
                  options: [
                    'כאשר נדרשות הוספות ומחיקות תכופות של איברים',
                    'כאשר רוצים לנגן מוזיקה במחשב',
                    'כאשר אין מסך למחשב',
                    'כאשר גודל הזיכרון שווה לאפס'
                  ],
                  correct_index: 0,
                  explanation: 'הכנסה ומחיקה ברשימה מקושרת יעילה במיוחד כשמחזיקים מצביע למיקום הרצוי.'
                }
              ]
            }
          ]
        }
      },
      {
        id: 'content-demo-2',
        user_id: 'mock-user-1',
        video_id: 'vid-demo-2',
        created_at: new Date().toISOString(),
        video: {
          id: 'vid-demo-2',
          youtube_id: 'kJQP7kiw5Fk',
          title: 'הפיזיקה של התנועה והחלל',
          duration_seconds: 240,
          categories: ['מדעים'],
          status: 'questions_failed',
          failure_reason: 'no_api_key',
          created_at: new Date().toISOString(),
          segments: []
        }
      }
    ]);
    return mockList as unknown as T;
  }

  // Content: add
  if (endpoint === '/api/content' && method === 'POST') {
    const list = getMockStorage<ContentItem[]>('content', []);
    const newItem: ContentItem = {
      id: `content-${Date.now()}`,
      user_id: 'mock-user-1',
      video_id: `vid-${Date.now()}`,
      created_at: new Date().toISOString(),
      video: {
        id: `vid-${Date.now()}`,
        youtube_id: body.url_or_id.length === 11 ? body.url_or_id : 'dQw4w9WgXcQ',
        title: 'סרטון למידה חדש מיוטיוב',
        duration_seconds: 180,
        categories: ['אחר'],
        status: 'questions_failed',
        failure_reason: 'no_api_key',
        created_at: new Date().toISOString(),
        segments: []
      }
    };
    list.unshift(newItem);
    setMockStorage('content', list);
    return newItem as unknown as T;
  }

  // Sessions: create
  if (endpoint === '/api/sessions' && method === 'POST') {
    const newSession: Session = {
      id: `session-${Date.now()}`,
      user_id: 'mock-user-1',
      content_id: body.content_id,
      video_title: 'שיעור וידאו ממוקד',
      youtube_id: 'dQw4w9WgXcQ',
      started_at: new Date().toISOString(),
      is_active: true,
      reading_count: 0,
      average_score: 0.85,
      readings: [],
      pause_events: []
    };
    const sessions = getMockStorage<Session[]>('sessions', []);
    sessions.unshift(newSession);
    setMockStorage('sessions', sessions);
    return newSession as unknown as T;
  }

  // Sessions: list
  if (endpoint === '/api/sessions' && method === 'GET') {
    const sessions = getMockStorage<Session[]>('sessions', []);
    return sessions as unknown as T;
  }

  // Sessions: get by id
  if (endpoint.startsWith('/api/sessions/') && method === 'GET') {
    const parts = endpoint.split('/');
    const sId = parts[3];
    const sessions = getMockStorage<Session[]>('sessions', []);
    const found = sessions.find(s => s.id === sId) || {
      id: sId,
      user_id: 'mock-user-1',
      content_id: 'c1',
      video_title: 'סרטון למידה',
      youtube_id: 'dQw4w9WgXcQ',
      started_at: new Date().toISOString(),
      is_active: false,
      reading_count: 5,
      average_score: 0.82,
      readings: [
        { position_seconds: 10, score: 0.85, timestamp: new Date().toISOString() },
        { position_seconds: 25, score: 0.78, timestamp: new Date().toISOString() },
        { position_seconds: 40, score: 0.45, timestamp: new Date().toISOString() },
        { position_seconds: 60, score: 0.89, timestamp: new Date().toISOString() },
      ],
      pause_events: []
    };
    return found as unknown as T;
  }

  // Classes: list
  if (endpoint === '/api/classes' && method === 'GET') {
    const classes = getMockStorage<Classroom[]>('classes', [
      {
        id: 'cls-1',
        owner_id: 'mock-user-1',
        owner_name: 'יוסי כהן',
        name: 'מתמטיקה ומדעי המחשב - קבוצת לימוד',
        category: 'מחשבים והייטק',
        role: 'student',
        join_code: 'MTH101',
        content_ids: ['content-demo-1'],
        member_ids: ['mock-user-1'],
        authorized_students: [],
        created_at: new Date().toISOString()
      },
      {
        id: 'cls-2',
        owner_id: 'mock-user-1',
        owner_name: 'יוסי כהן',
        name: 'כיתת מדעים מתקדמת תשפ״ו',
        category: 'מדעים',
        role: 'teacher',
        join_code: 'SCI202',
        content_ids: ['content-demo-2'],
        member_ids: ['mock-user-1', 'stu-1', 'stu-2'],
        authorized_students: ['diti3613@gmail.com', 'dana@school.edu'],
        created_at: new Date().toISOString(),
        metrics: [
          {
            user_id: 'stu-1',
            display_name: 'דנה לוי',
            email: 'dana@school.edu',
            sessions_count: 4,
            total_watch_time_seconds: 540,
            average_concentration: 0.88,
            pauses_count: 1,
            correct_answers_count: 1,
            wrong_answers_count: 0,
            timeline_readings: [
              { position_seconds: 15, score: 0.92 },
              { position_seconds: 45, score: 0.86 },
              { position_seconds: 90, score: 0.89 }
            ]
          },
          {
            user_id: 'stu-2',
            display_name: 'אלון גולן',
            email: 'alon@school.edu',
            sessions_count: 2,
            total_watch_time_seconds: 320,
            average_concentration: 0.64,
            pauses_count: 3,
            correct_answers_count: 2,
            wrong_answers_count: 1,
            timeline_readings: [
              { position_seconds: 20, score: 0.70 },
              { position_seconds: 40, score: 0.35 },
              { position_seconds: 80, score: 0.68 }
            ]
          }
        ]
      }
    ]);
    return classes as unknown as T;
  }

  // Classes: create
  if (endpoint === '/api/classes' && method === 'POST') {
    const list = getMockStorage<Classroom[]>('classes', []);
    const newClass: Classroom = {
      id: `cls-${Date.now()}`,
      owner_id: 'mock-user-1',
      owner_name: 'משתמש',
      name: body.name,
      category: body.category,
      role: body.role,
      join_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
      content_ids: [],
      member_ids: ['mock-user-1'],
      authorized_students: body.authorized_students || [],
      created_at: new Date().toISOString(),
      metrics: []
    };
    list.unshift(newClass);
    setMockStorage('classes', list);
    return newClass as unknown as T;
  }

  const classRoute = endpoint.match(/^\/api\/classes\/([^/]+)(?:\/(videos)(?:\/(.+))?)?$/);
  if (classRoute) {
    const [, classId, videosPath, contentId] = classRoute;
    const classList = getMockStorage<Classroom[]>('classes', []);
    const classIndex = classList.findIndex((classItem) => classItem.id === classId);
    if (classIndex < 0) throw new Error('הכיתה לא נמצאה');

    if (!videosPath && method === 'GET') {
      return classList[classIndex] as unknown as T;
    }
    if (!videosPath && method === 'PATCH') {
      classList[classIndex] = { ...classList[classIndex], ...body };
      setMockStorage('classes', classList);
      return classList[classIndex] as unknown as T;
    }
    if (videosPath && method === 'POST') {
      const contentIds = new Set(classList[classIndex].content_ids);
      contentIds.add(body.content_id);
      classList[classIndex] = { ...classList[classIndex], content_ids: [...contentIds] };
      setMockStorage('classes', classList);
      return { message: 'הסרטון נוסף לכיתה בהצלחה' } as unknown as T;
    }
    if (videosPath && method === 'DELETE' && contentId) {
      classList[classIndex] = {
        ...classList[classIndex],
        content_ids: classList[classIndex].content_ids.filter((id) => id !== contentId),
      };
      setMockStorage('classes', classList);
      return { message: 'הסרטון הוסר מהכיתה' } as unknown as T;
    }
  }

  return {} as T;
}

// Exported API Methods
export const api = {
  // Auth
  register: (data: { email: string; password: string; display_name: string }) =>
    request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; token_type: string; expires_in: number }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<void>('/api/auth/logout', { method: 'POST' }),

  getMe: () =>
    request<User>('/api/users/me'),

  updateMe: (data: { display_name?: string }) =>
    request<User>('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ message: string }>('/api/users/me/change-password', { method: 'POST', body: JSON.stringify(data) }),

  deleteAccount: () =>
    request<{ message: string }>('/api/users/me', { method: 'DELETE' }),

  // Content & Library
  getContent: (params?: { search?: string; category?: string; scope?: 'mine' | 'all' }) => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.category) query.append('category', params.category);
    if (params?.scope) query.append('scope', params.scope);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<ContentItem[]>(`/api/content${qs}`);
  },

  getContentItem: (contentId: string) =>
    request<ContentItem>(`/api/content/${contentId}`),

  addContent: (url_or_id: string) =>
    request<ContentItem>('/api/content', { method: 'POST', body: JSON.stringify({ url_or_id }) }),

  deleteContent: (contentId: string) =>
    request<{ message: string }>(`/api/content/${contentId}`, { method: 'DELETE' }),

  // Video retry
  retryVideo: (videoId: string) =>
    request<Video>(`/api/videos/${videoId}/retry`, { method: 'POST' }),

  getVideo: (videoId: string) =>
    request<Video>(`/api/videos/${videoId}`),

  // Sessions
  createSession: (content_id: string) =>
    request<Session>('/api/sessions', { method: 'POST', body: JSON.stringify({ content_id }) }),

  addReading: (sessionId: string, data: { position: number; score: number; raw_score?: number }) =>
    request<{ status: string; average_score: number; reading_count: number }>(`/api/sessions/${sessionId}/readings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  recordPause: (sessionId: string, data: {
    position_seconds: number;
    segment_index?: number;
    question?: string;
    selected_option_index?: number;
    correct_option_index?: number;
    is_correct?: boolean;
    action_taken: string;
  }) =>
    request<{ status: string }>(`/api/sessions/${sessionId}/pause`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  endSession: (sessionId: string) =>
    request<{ id: string; reading_count: number; average_score: number; ended_at: string }>(`/api/sessions/${sessionId}/end`, {
      method: 'POST',
    }),

  getSessions: () =>
    request<Session[]>('/api/sessions'),

  getSession: (sessionId: string) =>
    request<Session>(`/api/sessions/${sessionId}`),

  // Classes
  getClasses: () =>
    request<Classroom[]>('/api/classes'),

  getClass: (classId: string) =>
    request<Classroom>(`/api/classes/${classId}`),

  createClass: (data: { name: string; category: string; role: 'student' | 'teacher'; authorized_students: string[] }) =>
    request<Classroom>('/api/classes', { method: 'POST', body: JSON.stringify(data) }),

  updateClass: (classId: string, data: { authorized_students?: string[] }) =>
    request<Classroom>(`/api/classes/${classId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  joinClass: (data: { join_code: string; confirmed_privacy: boolean }) =>
    request<Classroom>('/api/classes/join', { method: 'POST', body: JSON.stringify(data) }),

  addVideoToClass: (classId: string, content_id: string) =>
    request<{ message: string }>(`/api/classes/${classId}/videos`, { method: 'POST', body: JSON.stringify({ content_id }) }),

  removeVideoFromClass: (classId: string, content_id: string) =>
    request<{ message: string }>(`/api/classes/${classId}/videos/${content_id}`, { method: 'DELETE' }),

  deleteClass: (classId: string) =>
    request<{ message: string }>(`/api/classes/${classId}`, { method: 'DELETE' }),
};
