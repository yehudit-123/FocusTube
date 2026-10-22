/**
 * FocusTube - Question & Pause Modal
 * Displays comprehension question when concentration drops below threshold,
 * or generic rewind suggestion for videos without questions.
 */

import React, { useState } from 'react';
import { Question } from '../types';
import { Brain, CheckCircle2, XCircle, RotateCcw, ArrowRight, HelpCircle } from 'lucide-react';

interface QuestionModalProps {
  isOpen: boolean;
  question: Question | null;
  questionNumber: number;
  totalQuestions: number;
  segmentTitle?: string;
  isGenericFallback?: boolean; // For videos with questions_failed
  onAnswerSelected: (selectedIndex: number, isCorrect: boolean) => void;
  onRewind: () => void;
  onContinue: () => void;
}

export const QuestionModal: React.FC<QuestionModalProps> = ({
  isOpen,
  question,
  questionNumber,
  totalQuestions,
  segmentTitle,
  isGenericFallback = false,
  onAnswerSelected,
  onRewind,
  onContinue,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  // 1. Generic fallback when video has no questions (questions_failed)
  if (isGenericFallback || !question) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center border border-amber-500/20">
            <Brain className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
              זיהינו ירידה ברמת הריכוז
            </h3>
            <p className="text-slate-300 text-base leading-relaxed">
              נראה שהתקשית להתרכז. רוצה לחזור לתחילת הקטע?
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={onRewind}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30"
            >
              <RotateCcw className="w-4 h-4" />
              <span>חזור לקטע</span>
            </button>

            <button
              onClick={onContinue}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>המשך</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Real Question Modal from Segment
  const handleSelect = (idx: number) => {
    if (isSubmitted) return;
    setSelectedIndex(idx);
    setIsSubmitted(true);

    const isCorrect = idx === question.correct_index;
    onAnswerSelected(idx, isCorrect);

    // If correct, give positive visual feedback then automatically continue after 1.8s
    if (isCorrect) {
      setTimeout(() => {
        setSelectedIndex(null);
        setIsSubmitted(false);
        onContinue();
      }, 1800);
    }
  };

  const isAnswered = isSubmitted && selectedIndex !== null;
  const isCorrect = isAnswered && selectedIndex === question.correct_index;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                עצירת ריכוז יזומה
              </span>
              <h3 className="text-lg font-bold text-white">
                {segmentTitle || 'בדיקת הבנה של החומר'}
              </h3>
            </div>
          </div>

          <div className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            {questionNumber}/{totalQuestions}
          </div>
        </div>

        {/* Question text */}
        <div className="space-y-2">
          <p className="text-lg sm:text-xl font-bold text-slate-100 leading-snug">
            {question.question}
          </p>
          <p className="text-xs text-slate-400">
            בחר את התשובה הנכונה ביותר לפי הנאמר בקטע שהוחמץ:
          </p>
        </div>

        {/* 4 Answer options */}
        <div className="grid grid-cols-1 gap-2.5">
          {question.options.map((option, idx) => {
            let btnStyle = 'bg-slate-950/80 hover:bg-slate-800/80 border-slate-800 text-slate-200';
            let icon = <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>;

            if (isAnswered) {
              if (idx === question.correct_index) {
                btnStyle = 'bg-emerald-950/60 border-emerald-500/80 text-emerald-200 shadow-md shadow-emerald-900/30';
                icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
              } else if (idx === selectedIndex) {
                btnStyle = 'bg-rose-950/60 border-rose-500/80 text-rose-200 shadow-md shadow-rose-900/30';
                icon = <XCircle className="w-5 h-5 text-rose-400 shrink-0" />;
              } else {
                btnStyle = 'opacity-40 border-slate-900 text-slate-400';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                disabled={isSubmitted}
                className={`flex items-center gap-3 p-4 rounded-2xl border text-right transition-all font-medium text-sm sm:text-base leading-relaxed ${btnStyle}`}
              >
                {icon}
                <span className="flex-1">{option}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback area */}
        {isAnswered && (
          <div className="animate-fade-in space-y-4 pt-2">
            {isCorrect ? (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-sm flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-bold">כל הכבוד! תשובה נכונה.</p>
                  <p className="text-xs text-emerald-300/80">חוזרים לצפייה בסרטון בעוד רגע...</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-sm space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-300">
                  <XCircle className="w-5 h-5 text-rose-400" />
                  <span>תשובה שגויה</span>
                </div>
                <p className="text-slate-300 text-xs sm:text-sm">
                  {question.explanation}
                </p>
              </div>
            )}

            {/* If wrong answer: Offer to rewind or continue */}
            {!isCorrect && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setSelectedIndex(null);
                    setIsSubmitted(false);
                    onRewind();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>חזור לתחילת הקטע</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedIndex(null);
                    setIsSubmitted(false);
                    onContinue();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>המשך</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
