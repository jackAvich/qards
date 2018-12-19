import React from 'react';

import Loadable from 'react-loadable';
import TrackVisibility from 'react-on-screen';

import {Article, Date, Excerpt, Hero, Title} from './styles';
import MarkdownRender from '../markdown';
import {cPattern, lineRepresentsEncodedComponent} from '../../utils/helpers';
import {decodeWidgetDataObject} from '../../cms/utils';

import QardHeader from '../qard/header';
import QardImageContent from '../qard/image/content';
import {PostType} from '../../fragments/post';
import {HTMLDivProps} from '@blueprintjs/core';

export interface Props {
	post?: PostType;
	//  if it's an admin preview (netlify cms) certain features will behave differently
	preview?: boolean;
	previewData?: {
		md: string;
		title: string;
		excerpt: string;
		created_at: string;
		heroImage: {
			alt: string;
			image: string;
		}
	}
}

interface bodyLine {
	line: string;
	computed: any;
	isWidget: boolean;
}

interface State {
	bodyLines: bodyLine[];
}

export default class Post extends React.Component<Props, State> {
	state = {bodyLines: []};

	staticWidgets = ['image', 'qards-section-heading'];

	/**
	 * I can't stress this enough but we should import only what
	 * is required by the post. We will have huge pages otherwise
	 * and our responsiveness will suffer.
	 *
	 * The only exception here is the QardHeader module which I
	 * consider to be required in order to output a SEO friendly
	 * post page that renders headings and paragraphs before anything
	 * else that gets resolved meanwhile.
	 */
	async renderComponent(line: string): Promise<HTMLDivProps> {
		return new Promise((resolve, reject) => {
			const {preview, post} = this.props;

			const params = line.match(cPattern);
			if (!params || params.length < 3) return;

			const widget = params[1];
			const config = decodeWidgetDataObject(params[2]);

			let module: Promise<any> | null, Component;

			//	image and header are loaded for all posts immediately
			switch (widget) {
				case 'image':
					module = import(/* webpackPrefetch: true */ '../qard/image/content');
					break;
				case 'qards-code':
					module = import(/* webpackPrefetch: true */ '../qard/code');
					break;
				case 'qards-reveal':
					module = import(/* webpackPrefetch: true */ '../qard/reveal');
					break;
				case 'qards-callout':
					module = import(/* webpackPrefetch: true */ '../qard/callout');
					break;
				case 'qards-audio':
					module = import(/* webpackPrefetch: true */ '../qard/audio');
					break;
				case 'qards-video':
					module = import(/* webpackPrefetch: true */ '../qard/video');
					break;
				case 'qards-divider':
					module = import(/* webpackPrefetch: true */ '../qard/divider');
					break;
				case 'qards-gallery':
					module = import(/* webpackPrefetch: true */ '../qard/gallery');
					break;
				case 'qards-countdown':
					module = import(/* webpackPrefetch: true */ '../qard/countdown');
					break;
				case 'qards-reference':
					module = import(/* webpackPrefetch: true */ '../qard/reference');
					break;
				case 'qards-section-heading':
					module = import(/* webpackPrefetch: true */ '../qard/header/');
					break;
				default:
					module = null;
			}

			if (module) {
				return module.then(({default: Component}) => {
					resolve(<TrackVisibility once>
						<Component post={post} preview={preview} {...config}/>
					</TrackVisibility>);
				});
			} else {
				reject(`Unknown widget: ${widget}`);
			}
		});
	}

	renderImage(config: any) {
		const {preview, post} = this.props;
		return <QardImageContent post={post} preview={preview} {...config}/>;
	}

	renderHeading(config: any) {
		return <QardHeader {...config}/>;
	}

	renderStaticWidget(line: string) {
		const params = line.match(cPattern);

		if (!params || params.length < 3) return;

		const widget = params[1];
		const config = decodeWidgetDataObject(params[2]);

		switch (widget) {
			case 'image':
				return this.renderImage(config);
			default:
				return this.renderHeading(config);
		}
	}

	get mdLines(): string[] {
		const {post, previewData} = this.props;
		const md: string = post ? post.md : (previewData ? previewData.md : '');
		return md.split('\n');
	}

	isAsyncWidget(widget: string | null): boolean {
		return !this.staticWidgets.includes(widget || '');
	}

	widgetFromLine(line: string): string {
		const params = line.match(cPattern);
		if (!params || params.length < 3) throw new Error('bad widget detected');
		return params[1];
	}

	async componentDidMount(): Promise<void> {
		const lines = this.mdLines;

		let bodyLines: bodyLine[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];


			if (lineRepresentsEncodedComponent(line)) {
				const computed = await this.renderComponent(line);

				bodyLines.push({
					line, computed, isWidget: true,
				});
			} else {
				bodyLines.push({
					line, computed: line, isWidget: false,
				});
			}
		}

		this.setState({bodyLines});
	}

	renderStaticBody() {
		//	Since we're code splitting the qard modules and lazy loading them
		//	we're losing SEO. This method returns the markdown without the qard
		//	modules so we can push the text content out right away until the
		//	modules get loaded
		let accumulator: string[] = [];

		return <React.Fragment>
			{this.mdLines.map((line: string, k) => {
				if (lineRepresentsEncodedComponent(line)) {
					if (!this.isAsyncWidget(this.widgetFromLine(line))) {
						//	render everything that is collected inside
						//	our accumulator and then render the component
						//	also resets the accumulator
						const acc = accumulator.join('\n');
						accumulator = [];

						return <React.Fragment key={k}>
							<div className="paragraphs">
								<MarkdownRender md={acc}/>
							</div>
							{this.renderStaticWidget(line)}
						</React.Fragment>;
					}
				} else {
					//	non-component, add it to our acc
					accumulator.push(line);
				}
			})}

			{(accumulator.length > 0) && <div className="paragraphs">
				<MarkdownRender md={accumulator.join('\n')}/>
			</div>}
		</React.Fragment>;
	}

	renderBody() {
		if (this.state.bodyLines.length == 0) return this.renderStaticBody();

		let accumulator: string[] = [];

		return <React.Fragment>
			{this.state.bodyLines.map((line: bodyLine, k) => {
				if (line.isWidget) {
					//	render everything that is collected inside
					//	our accumulator and then render the component
					//	also resets the accumulator
					const acc = accumulator.join('\n');
					accumulator = [];

					return <React.Fragment key={k}>
						<div className="paragraphs">
							<MarkdownRender md={acc}/>
						</div>
						{line.computed}
					</React.Fragment>;
				} else {
					//	non-component, add it to our acc
					accumulator.push(line.computed);
				}
			})}

			{(accumulator.length > 0) && <div className="paragraphs">
				<MarkdownRender md={accumulator.join('\n')}/>
			</div>}
		</React.Fragment>;
	}

	render() {
		const {post, previewData} = this.props;

		//	Normalize some items by being prepared for preview (netlify cms) and production
		const title = post ? post.frontmatter.title : (previewData ? previewData.title : '');
		const created_at = post ? post.frontmatter.created_at : (previewData ? previewData.created_at : '');
		const excerpt = post ? post.frontmatter.excerpt : (previewData ? previewData.excerpt : '');

		let hero;
		if (post && post.frontmatter.hero && post.frontmatter.hero.image) {
			hero = {
				alt: post.frontmatter.hero.alt || '',
				...post.frontmatter.hero.image.sharp,
			};
		} else if (previewData && previewData.heroImage.image) {
			hero = {
				src: previewData.heroImage.image,
				alt: previewData.heroImage.alt || '',
			};
		}
		const md = post ? post.md : (previewData ? previewData.md : '');

		return (
			<Article>
				{title && <Title className={'qards-post-title'}>{title}</Title>}
				{created_at && <Date className={'qards-post-date'}>{created_at.toString()}</Date>}
				{hero && <Hero className={'qards-post-hero'}><QardImageContent {...hero}/></Hero>}
				{excerpt && <Excerpt className={'qards-post-excerpt'}>{excerpt}</Excerpt>}

				{this.renderBody()}
			</Article>
		);
	}
}
