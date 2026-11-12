import { useEffect, useRef, useState } from 'react';
import { loadLessons } from './lesson/load';
import { Lesson } from './lesson/types';
import { CameraTracker } from './pose/tracker';
import { Home } from './ui/Home';
import { Practice } from './ui/Practice';
import { Review } from './ui/Review';
import { Setup } from './ui/Setup';
import { initialSettings } from './ui/settings';

type Screen = 'home' | 'setup' | 'practice' | 'review';

export function App() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState(initialSettings);
  const tracker = useRef<CameraTracker | null>(null);

  useEffect(() => {
    void loadLessons().then(setLessons);
  }, []);

  const releaseCamera = () => {
    tracker.current?.stop();
    tracker.current = null;
  };

  if (screen === 'setup' && lesson) {
    return (
      <Setup
        lesson={lesson}
        settings={settings}
        onChange={setSettings}
        onBack={() => setScreen('home')}
        onStart={(t) => {
          tracker.current = t;
          setScreen('practice');
        }}
      />
    );
  }
  if (screen === 'practice' && lesson) {
    return (
      <Practice
        lesson={lesson}
        tracker={tracker.current}
        settings={settings}
        onExit={(attempts) => {
          releaseCamera();
          setScreen(attempts.length > 0 ? 'review' : 'home');
        }}
      />
    );
  }
  if (screen === 'review' && lesson) {
    return <Review lesson={lesson} onBack={() => setScreen('home')} onPractise={() => setScreen('setup')} />;
  }
  return (
    <Home
      lessons={lessons}
      onPick={(l) => {
        setLesson(l);
        setScreen('setup');
      }}
      onReview={(l) => {
        setLesson(l);
        setScreen('review');
      }}
    />
  );
}
