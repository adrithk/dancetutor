import { useEffect, useState } from 'react';
import { removeFromLibrary, saveToLibrary } from './lesson/library';
import { loadLessons } from './lesson/load';
import { deleteImported, getImported } from './lesson/store';
import { Lesson } from './lesson/types';
import { Home } from './ui/Home';
import { Import } from './ui/Import';
import { Practice } from './ui/Practice';
import { initialSettings } from './ui/settings';

type Screen = 'home' | 'import' | 'practice';

export function App() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [settings] = useState(initialSettings);

  const reload = () => loadLessons().then(setLessons);
  useEffect(() => {
    void reload();
  }, []);

  const practise = (l: Lesson) => {
    setLesson(l);
    setScreen('practice');
  };

  if (screen === 'import') {
    return (
      <Import
        taken={(lessons ?? []).map((l) => l.id)}
        onBack={() => setScreen('home')}
        onDone={(added) => {
          void reload();
          practise(added);
        }}
      />
    );
  }
  if (screen === 'practice' && lesson) {
    return <Practice key={lesson.id} lesson={lesson} settings={settings} onExit={() => setScreen('home')} />;
  }
  return (
    <Home
      lessons={lessons}
      onPick={practise}
      onAdd={() => setScreen('import')}
      onDelete={(l) => void (l.source === 'bundled' ? removeFromLibrary(l.id) : deleteImported(l.id)).then(reload)}
      onShare={async (l) => {
        // Copy the routine into the library, then drop the device-only copy.
        const stored = await getImported(l.id);
        if (!stored) return;
        await saveToLibrary(stored.meta, stored.poses, stored.video, stored.meta.video ?? 'video.mp4', (lessons ?? []).map((x) => x.id));
        await deleteImported(l.id);
        await reload();
      }}
    />
  );
}
