/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
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
