import { vi } from 'vitest'

vi.mock('motion/react', () => import('@/test/motion-react-vitest-mocks').then(m => m.motionReactVitestMock))
vi.mock('motion/react-m', () => import('@/test/motion-react-vitest-mocks').then(m => m.motionReactMVitestMock))
