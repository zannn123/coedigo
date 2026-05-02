import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  ChevronRight,
  History,
  Loader2,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './AcademicAssistantRail.css';

const CHATBOT_BASE_URL = (import.meta.env.VITE_AI_CHATBOT_BASE_URL || '/ai-chatbot').replace(/\/$/, '');

const QUICK_QUESTIONS = {
  student: [
    'What is my class schedule today?',
    'What is my next class?',
    'Show my grades this semester.',
    'Am I at risk?',
  ],
  faculty: [
    'Who are the students that need attention?',
    'Which students are high risk?',
    'Which students have missing activities?',
    'Summarize my class performance.',
  ],
  dean: [
    'Which students are academically at risk?',
    'Which subjects have many struggling students?',
    'Show overall student performance.',
  ],
  program_chair: [
    'Which students are academically at risk?',
    'Show high-risk students by program.',
    'Which subjects have many struggling students?',
  ],
  admin: [
    'Show overall student performance.',
    'Which students are academically at risk?',
    'Which subjects have many struggling students?',
  ],
};

const ROLE_LABELS = {
  student: 'Student',
  faculty: 'Faculty',
  dean: 'Dean',
  program_chair: 'Program chair',
  admin: 'Admin',
};

export default function AcademicAssistantRail({ open, onOpenChange }) {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('chat');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const quickQuestions = QUICK_QUESTIONS[user?.role] || QUICK_QUESTIONS.student;
  const canAsk = Boolean(user?.id && user?.role);
  const roleLabel = ROLE_LABELS[user?.role] || 'Academic records';

  const loadSessions = useCallback(async () => {
    if (!canAsk) return;

    setSessionsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        user_id: String(user.id),
        role: user.role,
        limit: '25',
      });
      const response = await fetch(`${CHATBOT_BASE_URL}/chat/sessions?${params.toString()}`);
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};

      if (!response.ok) {
        throw new Error(data.reply || data.message || 'Unable to load chat history.');
      }

      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setSessionsLoaded(true);
    } catch (caughtError) {
      setError(caughtError.message || 'Chat history is unavailable right now.');
    } finally {
      setSessionsLoading(false);
    }
  }, [canAsk, user?.id, user?.role]);

  const loadSessionHistory = useCallback(async (targetSessionId) => {
    if (!canAsk || !targetSessionId) return;

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        user_id: String(user.id),
        role: user.role,
        session_id: targetSessionId,
        limit: '80',
      });
      const response = await fetch(`${CHATBOT_BASE_URL}/chat/history?${params.toString()}`);
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};

      if (!response.ok) {
        throw new Error(data.reply || data.message || 'Unable to load this conversation.');
      }

      setMessages((Array.isArray(data.messages) ? data.messages : []).map(toMessage));
      setSessionId(targetSessionId);
      setActiveView('chat');
      window.setTimeout(() => inputRef.current?.focus(), 120);
    } catch (caughtError) {
      setError(caughtError.message || 'Unable to continue this conversation right now.');
    } finally {
      setLoading(false);
    }
  }, [canAsk, user?.id, user?.role]);

  useEffect(() => {
    if (!open || activeView !== 'chat') return;
    window.setTimeout(() => inputRef.current?.focus(), 180);
  }, [activeView, open]);

  useEffect(() => {
    setActiveView('chat');
    setMessages([]);
    setSessions([]);
    setSessionsLoaded(false);
    setSessionId(null);
    setError('');
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (open && activeView === 'history' && !sessionsLoaded) {
      loadSessions();
    }
  }, [activeView, loadSessions, open, sessionsLoaded]);

  useEffect(() => {
    if (!scrollRef.current || activeView !== 'chat') return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeView, messages, loading]);

  const openChat = () => {
    if (open && activeView === 'chat') {
      onOpenChange(false);
      return;
    }

    setActiveView('chat');
    setError('');
    onOpenChange(true);
  };

  const openHistory = () => {
    setActiveView('history');
    setError('');
    onOpenChange(true);
    if (!sessionsLoaded) loadSessions();
  };

  const startNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setInput('');
    setError('');
    setActiveView('chat');
    onOpenChange(true);
    window.setTimeout(() => inputRef.current?.focus(), 120);
  };

  const sendMessage = async (messageText) => {
    const text = messageText.trim();
    if (!text || loading) return;

    setActiveView('chat');
    onOpenChange(true);
    setInput('');
    setError('');
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', text }]);

    if (!canAsk) {
      setMessages(current => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', text: 'Sorry, your session information is missing. Please sign in again.' },
      ]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${CHATBOT_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          role: user.role,
          message: text,
          session_id: sessionId,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {};
      const reply = data.reply || buildChatbotFallback(response);

      setMessages(current => [
        ...current,
        {
          id: crypto.randomUUID(),
          messageId: data.message_id,
          sessionId: data.session_id,
          role: 'assistant',
          text: reply,
          suggestions: Array.isArray(data.suggested_questions) ? data.suggested_questions : [],
        },
      ]);
      if (data.session_id) setSessionId(data.session_id);
      setSessionsLoaded(false);

      if (!response.ok) {
        setError(reply);
      }
    } catch {
      const fallback = 'The academic assistant is unavailable. Start the chatbot API and try again.';
      setError(fallback);
      setMessages(current => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', text: fallback },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (targetSessionId) => {
    if (!canAsk || !targetSessionId || deletingSessionId) return;

    setDeletingSessionId(targetSessionId);
    setError('');
    try {
      const params = new URLSearchParams({
        user_id: String(user.id),
        role: user.role,
      });
      const response = await fetch(`${CHATBOT_BASE_URL}/chat/sessions/${encodeURIComponent(targetSessionId)}?${params.toString()}`, {
        method: 'DELETE',
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};

      if (!response.ok) {
        throw new Error(data.message || data.reply || 'Unable to delete this conversation.');
      }

      setSessions(current => current.filter(session => session.id !== targetSessionId));
      if (sessionId === targetSessionId) {
        setSessionId(null);
        setMessages([]);
      }
    } catch (caughtError) {
      setError(caughtError.message || 'Unable to delete this conversation right now.');
    } finally {
      setDeletingSessionId('');
    }
  };

  const submitFeedback = async (messageId, rating) => {
    if (!canAsk || !messageId) return;

    try {
      const response = await fetch(`${CHATBOT_BASE_URL}/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageId,
          user_id: user.id,
          rating,
        }),
      });

      if (!response.ok) throw new Error('feedback failed');
      setMessages(current => current.map(item => (
        item.messageId === messageId ? { ...item, feedback: rating } : item
      )));
    } catch {
      setError('Unable to save feedback right now.');
    }
  };

  const buildChatbotFallback = (response) => {
    if (!response.ok) {
      return 'The academic assistant service is not running or cannot be reached. Start the chatbot API and try again.';
    }

    return 'The academic assistant returned an unexpected response. Please check the chatbot API logs.';
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage(input);
  };

  const title = activeView === 'history' ? 'Chat history' : 'Academic Assistant';
  const subtitle = activeView === 'history' ? 'Continue or delete saved chats' : roleLabel;

  return (
    <section className={`academic-assistant-shell ${open ? 'is-open' : ''}`} aria-label="C.O.E.D.I.G.O. Academic Assistant">
      <aside className="academic-assistant-panel" aria-hidden={!open}>
        <div className="assistant-panel-header">
          <div className="assistant-title-block">
            <span className="assistant-title-icon"><BrainCircuit size={18} /></span>
            <div>
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </div>
          </div>
          <div className="assistant-header-actions">
            {activeView === 'history' && (
              <button type="button" className="assistant-text-btn" onClick={startNewChat}>
                New chat
              </button>
            )}
            <button type="button" className="assistant-icon-btn" onClick={() => onOpenChange(false)} aria-label="Collapse academic assistant" title="Collapse">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {activeView === 'history' ? (
          <div className="assistant-history-view">
            <div className="assistant-history-toolbar">
              <span>{sessions.length} saved conversation{sessions.length === 1 ? '' : 's'}</span>
              <button type="button" onClick={loadSessions} disabled={sessionsLoading}>
                {sessionsLoading ? 'Refreshing' : 'Refresh'}
              </button>
            </div>

            <div className="assistant-history-list">
              {sessionsLoading && (
                <div className="assistant-history-empty">
                  <Loader2 size={18} className="assistant-spin" />
                  <span>Loading chat history...</span>
                </div>
              )}

              {!sessionsLoading && sessions.length === 0 && (
                <div className="assistant-history-empty">
                  <History size={22} />
                  <strong>No saved conversations yet.</strong>
                  <span>Start a chat, then return here to continue it later.</span>
                  <button type="button" onClick={startNewChat}>Start chat</button>
                </div>
              )}

              {!sessionsLoading && sessions.map(session => (
                <div key={session.id} className={`assistant-history-item ${session.id === sessionId ? 'is-active' : ''}`}>
                  <button type="button" className="assistant-history-main" onClick={() => loadSessionHistory(session.id)}>
                    <strong>{formatIntentLabel(session.last_intent)}</strong>
                    <span>{session.preview || session.summary || 'Saved academic assistant conversation'}</span>
                    <small>{formatSessionTime(session.last_message_at)} · {session.message_count || 0} turn{session.message_count === 1 ? '' : 's'}</small>
                  </button>
                  <button
                    type="button"
                    className="assistant-history-delete"
                    onClick={() => deleteSession(session.id)}
                    disabled={deletingSessionId === session.id}
                    aria-label="Delete conversation"
                    title="Delete conversation"
                  >
                    {deletingSessionId === session.id ? <Loader2 size={15} className="assistant-spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="assistant-message-list" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="assistant-empty-state">
                <Sparkles size={22} />
                <strong>Ask a focused academic question.</strong>
                <div className="assistant-quick-grid">
                  {quickQuestions.map(question => (
                    <button
                      key={question}
                      type="button"
                      className="assistant-quick-chip"
                      onClick={() => sendMessage(question)}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(message => (
              <div key={message.id} className={`assistant-message ${message.role === 'user' ? 'from-user' : 'from-assistant'}`}>
                <span>{message.text}</span>
                {message.role === 'assistant' && message.messageId && (
                  <div className="assistant-feedback-row" aria-label="Answer feedback">
                    <button
                      type="button"
                      className={message.feedback === 'helpful' ? 'is-selected' : ''}
                      onClick={() => submitFeedback(message.messageId, 'helpful')}
                      aria-label="Mark answer helpful"
                      title="Helpful"
                    >
                      <ThumbsUp size={13} />
                    </button>
                    <button
                      type="button"
                      className={message.feedback === 'not_helpful' ? 'is-selected' : ''}
                      onClick={() => submitFeedback(message.messageId, 'not_helpful')}
                      aria-label="Mark answer not helpful"
                      title="Not helpful"
                    >
                      <ThumbsDown size={13} />
                    </button>
                  </div>
                )}
                {message.role === 'assistant' && Array.isArray(message.suggestions) && message.suggestions.length > 0 && (
                  <div className="assistant-suggestion-row">
                    {message.suggestions.slice(0, 3).map(suggestion => (
                      <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="assistant-message from-assistant assistant-loading-row">
                <Loader2 size={16} className="assistant-spin" />
                <span>Retrieving records...</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="assistant-error">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {activeView === 'chat' && (
          <form className="assistant-composer" onSubmit={handleSubmit}>
            <label htmlFor="academic-assistant-message" className="assistant-sr-only">Message</label>
            <textarea
              id="academic-assistant-message"
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask about academic records"
              rows={2}
              disabled={loading}
            />
            <button type="submit" className="assistant-send-btn" disabled={loading || !input.trim()} aria-label="Send message">
              {loading ? <Loader2 size={18} className="assistant-spin" /> : <Send size={18} />}
            </button>
          </form>
        )}
      </aside>

      <div className="academic-assistant-rail">
        <div className="assistant-rail-actions">
          <button
            type="button"
            className={`assistant-rail-button ${open && activeView === 'chat' ? 'is-active' : ''}`}
            onClick={openChat}
            aria-expanded={open && activeView === 'chat'}
            aria-label={open && activeView === 'chat' ? 'Hide academic assistant' : 'Open academic assistant'}
            title="Academic Assistant"
          >
            <Bot size={24} />
          </button>
          <button
            type="button"
            className={`assistant-rail-button ${open && activeView === 'history' ? 'is-active' : ''}`}
            onClick={openHistory}
            aria-expanded={open && activeView === 'history'}
            aria-label="Open chat history"
            title="Chat history"
          >
            <History size={23} />
          </button>
        </div>
      </div>
    </section>
  );
}

function toMessage(item) {
  return {
    id: item.id || crypto.randomUUID(),
    messageId: item.message_id,
    sessionId: item.session_id,
    role: item.role,
    text: item.text,
  };
}

function formatIntentLabel(intent) {
  if (!intent) return 'Academic chat';
  return intent
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSessionTime(value) {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
