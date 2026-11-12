import { useEffect, useRef, useState } from 'react';
import { loadLessons } from './lesson/load';
import { deleteImported } from './lesson/store';
import { Lesson } from './lesson/types';
import { CameraTracker } from './pose/tracker';
import { Home } from './ui/Home';
import { Import } from './ui/Import';
import { Practice } from './ui/Practice';
import { Review } from './ui/Review';
import { Setup } from './ui/Setup';
import { initialSettings } from './ui/settings';

type Screen = 'home' | 'import' | 'setup' | 'practice' | 'review';

export function App() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState(initialSettings);
  const tracker = useRef<CameraTracker | null>(null);

  const reload = () => loadLessons().then(setLessons);
  useEffect(() => {
    void reload();
  }, []);

  const releaseCamera = () => {
    tracker.current?.stop();
    tracker.current = null;
  };

  if (screen === 'import') {
    return (
      <Import
        onBack={() => setScreen('home')}
        onDone={(added) => {
          void reload();
          setLesson(added);
          setScreen('setup');
        }}
      />
    );
  }
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
      onAdd={() => setScreen('import')}
      onDelete={(l) => void deleteImported(l.id).then(reload)}
    />
  );
}
