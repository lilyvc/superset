import { Card as AntdCard } from 'antd';
import type { CardProps } from 'antd';
import GitHubButton from 'react-github-btn';
import type { ComponentType, ReactNode } from 'react';

// antd's CardInterface (an interface extending a typeof'd function) and
// react-github-btn's PureComponent declaration both lose their JSX
// call/construct signatures under the TypeScript 7 typecheck, so the
// imported symbols cannot be used as JSX elements directly.
export const Card = AntdCard as unknown as ComponentType<CardProps>;
export const GHButton = GitHubButton as unknown as ComponentType<
  Record<string, unknown> & { children?: ReactNode }
>;
