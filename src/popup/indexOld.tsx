import { useEffect, useState } from 'react';

import Logger from '~services/Logger';
import TabHelper from '~services/TabHelper';
import usePrefs, { usePrefStorage } from '~services/usePrefs';

import type { TabSession } from 'index';

import { COLOR_MODE_STATE_TRANSITIONS, DisplayColorMode, MaxSaccadesInterval, SACCADE_COLORS, SACCADE_STYLES } from '~services/config';
import documentParser from '~services/documentParser';
import defaultPrefs from '~services/preferences';
import runTimeHandler from '~services/runTimeHandler';

import { envService } from '~services/envService';
import { HtmlNodeToggles } from './HtmlNodeToggles';
import Shortcut, { ShortcutGuide } from './shorcut';
import { ShowDebugInline } from './ShowInlineDebug';
import Mellowtel from "mellowtel";
import {CONFIG_KEY, DISABLE_LOGS} from "~constants";

const popupLogStyle = 'background:cyan;color:brown';

const darkToggle = chrome.runtime.getURL('./assets/moon-solid.svg');
const lightToggle = chrome.runtime.getURL('./assets/sun-light-solid.svg');

const { setAttribute, setProperty, setSaccadesStyle } = documentParser.makeHandlers(document);

const FIXATION_OPACITY_STOPS = 5;
const FIXATION_OPACITY_STOP_UNIT_SCALE = Math.floor(100 / FIXATION_OPACITY_STOPS);

const SHOW_FOOTER_MESSAGE_DURATION = 12_000;
const FOOT_MESSAGAES_ANIMATION_DELAY = 300;
const FIRST_FOOTER_MESSAGE_INDEX = 1;

function IndexPopupOld() {
	const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
	const [footerMessageIndex, setFooterMeessageIndex] = useState(null);

	const [prefs, setPrefs] = usePrefs(async () => await TabHelper.getTabOrigin(await TabHelper.getActiveTab(true)), true, envService.PLASMO_PUBLIC_TARGET);

	const [tabSession, setTabSession] = useState<TabSession | null>(null);

	const [appConfigPrefs, setAppConfigPrefs] = usePrefStorage();

	const footerMessagesLength = 3;
	const nextMessageIndex = (oldFooterMessageIndex: typeof footerMessageIndex) =>
		typeof oldFooterMessageIndex !== 'number' ? FIRST_FOOTER_MESSAGE_INDEX : (oldFooterMessageIndex + 1) % footerMessagesLength;

	useEffect(() => {
		if (!tabSession) return;

		documentParser.setReadingMode(tabSession.brMode, document, '');
	}, [tabSession]);

	useEffect(() => {
		Logger.logInfo('%cprefstore updated', popupLogStyle, prefs);

		if (!appConfigPrefs?.transformControlPanelText || !prefs) return;

		setProperty('--fixation-edge-opacity', prefs.fixationEdgeOpacity + '%');
		setSaccadesStyle(prefs.saccadesStyle);
		setAttribute('saccades-color', prefs.saccadesColor);
		setAttribute('fixation-strength', prefs.fixationStrength);
		setAttribute('saccades-interval', prefs.saccadesInterval);
	}, [prefs]);

	useEffect(() => {
		(async () => {
			const _activeTab = await TabHelper.getActiveTab(true);
			setActiveTab(_activeTab);
			Logger.logInfo('%cactiveTab', popupLogStyle, _activeTab);

			const origin = await TabHelper.getTabOrigin(_activeTab);

			_activeTab.id &&
				chrome.tabs.sendMessage(_activeTab.id, { type: 'getReadingMode' }, ({ data }) => {
					setTabSession({ brMode: data, origin });
				});
		})();

		runTimeHandler.runtime.onMessage.addListener((request, sender, sendResponse) => {
			Logger.logInfo('PopupMessageListenerFired');

			switch (request.message) {
				case 'setIconBadgeText': {
					setTabSession((oldTabSession) => ({
						...oldTabSession,
						brMode: request.data,
					}));
					break;
				}
				default: {
					break;
				}
			}
		});

		let footerInterval: NodeJS.Timer;

		setTimeout(() => {
			setFooterMeessageIndex(nextMessageIndex);

			footerInterval = setInterval(() => {
				setFooterMeessageIndex(nextMessageIndex);
			}, SHOW_FOOTER_MESSAGE_DURATION);
		}, FOOT_MESSAGAES_ANIMATION_DELAY);

		return () => {
			clearInterval(footerInterval);
		};
	}, []);

	const makeUpdateChangeEventHandler =
		(field: string) =>
		(event, customValue = null) =>
			updateConfig(field, customValue ?? event.target.value);

	const updateConfig = (key: string, value: any, configLocal = prefs) => {
		const newConfig = { ...configLocal, [key]: value };

		setPrefs(async () => await TabHelper.getTabOrigin(await TabHelper.getActiveTab(true)), newConfig.scope, newConfig);
	};

	const handleToggle = (newBrMode: boolean) => {
		const payload = {
			type: 'setReadingMode',
			message: 'setIconBadgeText',
			data: newBrMode,
		};

		setTabSession({ ...tabSession, brMode: newBrMode });
		(runTimeHandler as typeof chrome).runtime.sendMessage(payload, () => Logger.LogLastError());

		TabHelper.getActiveTab(true).then((tab) => chrome.tabs.sendMessage(tab.id, payload, () => Logger.LogLastError()));
	};

	const handleDisplayColorModeChange = async (currentDisplayColorMode) => {
		console.log('handleDisplayColorModeChange', currentDisplayColorMode);

		if (![...Object.values(DisplayColorMode)].includes(currentDisplayColorMode)) {
			alert('not allowed');
			return;
		}

		const [, displayColorMode] = COLOR_MODE_STATE_TRANSITIONS.find(([key]) => new RegExp(currentDisplayColorMode, 'i').test(key));

		await setAppConfigPrefs({ ...appConfigPrefs, displayColorMode });
		console.log('handleDisplayColorModeChange', appConfigPrefs);
	};

	const showOptimal = (key: string, value = null) => {
		if (!prefs) return null;

		if ((value ?? prefs?.[key]) == defaultPrefs?.[key]) return <span className="ml-auto text-sm">Optimal</span>;
	};

	const animateFooterMessageVisibility = (index, _footerMessageIndex = footerMessageIndex) => {
		return 'animated-footer-link ' + (index === footerMessageIndex && ' animated-footer-link-show');
	};

	const getFooterLinks = (textColor = 'text-secondary', onClickPasser) => (
		<>
			<div className="flex justify-between || text-center text-md text-bold w-full gap-3">
				<a className={`${textColor} text-uppercase`} href="https://github.com/ansh/jiffyreader.com#FAQ" target="_blank">
					{chrome.i18n.getMessage('faqLinkText')}
				</a>

				<a className={`${textColor} text-capitalize`} href="https://github.com/ansh/jiffyreader.com#reporting-issues-bugs-and-feature-request" target="_blank">
					{chrome.i18n.getMessage('reportIssueLinkText')}
				</a>

				<a
					className={`${textColor} text-capitalize`}
					style={{ cursor: 'pointer' , textDecoration: 'underline' }}
					onClick={onClickPasser}
					target="_blank"
				>
					{"Mellowtel"}
				</a>
			</div>

			<div className="version_dark_mode_toggle|| flex justify-between align-items-center || ">
				<div className={'|| text-left text-md ' + textColor}>{envService.PLASMO_PUBLIC_VERSION_NAME}</div>

				<div className="light-dark-container">
					<button
						type="button"
						name="display_mode_switch"
						id="display_mode_switch"
						className="button text-capitalize  text-alternate"
						value={`${Object.fromEntries(COLOR_MODE_STATE_TRANSITIONS)[appConfigPrefs?.displayColorMode]} mode toggle`}
						onClick={() => handleDisplayColorModeChange(appConfigPrefs.displayColorMode)}
						aria-description="light mode dark mode toggle">
						<svg width="20" height="20">
							<image width="20" height="20" href={appConfigPrefs?.displayColorMode == 'light' ? darkToggle : lightToggle} />
						</svg>
					</button>
				</div>
			</div>

			<div className="translation_help_request pos-relative">
				<a
					href="https://github.com/ansh/jiffyreader.com#help-with-translations"
					className={'text-capitalize ' + textColor + ' ' + animateFooterMessageVisibility(0)}
					target="_blank">
					{chrome.i18n.getMessage('translationHelpLinkText')}
				</a>

				<a
					className={'text-capitalize ' + textColor + ' ' + animateFooterMessageVisibility(1)}
					href="https://docs.google.com/forms/d/e/1FAIpQLScPVRqk6nofBSX0cyb_UE2VlxsRKWFZacmKiU2OkGC3QA6YKQ/viewform?usp=pp_url">
					{chrome.i18n.getMessage('surveyPromptText')}
				</a>

				<a href="https://www.buymeacoffee.com/jiffyreader" target="_blank" className={animateFooterMessageVisibility(2)}>
					<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" className="buymeacoffee" />
				</a>
			</div>
		</>
	);

	const reloadActiveTab = async (_activeTab = activeTab) => {
		await chrome.tabs.reload(_activeTab.id);
	};

	const openPermissionPage = () => {
		chrome.tabs.create({
			url: 'chrome://extensions/?id=jjjipoongdlfeenlicdoeadmabalokca',
		});
	};

	const showFileUrlPermissionRequestMessage = (tabSession: TabSession, prefs, _activeTab = activeTab) => {
		if (!/chrome/i.test(envService.PLASMO_PUBLIC_TARGET) || !/^file:\/\//i.test(tabSession?.origin ?? activeTab?.url) || prefs) {
			return null;
		}

		return (
			<>
				<h2>{chrome.i18n.getMessage('missingPermissionHeaderText')}</h2>
				<span>{chrome.i18n.getMessage('missingPermissionHeaderSubText')}</span>
				<ol className="|| flex flex-column || m-0 p-3">
					<li>
						<button className="text-capitalize" onClick={openPermissionPage}>
							{chrome.i18n.getMessage('openPermissionPageBtnText')}
						</button>
					</li>
					<li>{chrome.i18n.getMessage('grantPermissionInstructionText')}</li>
					<li>{chrome.i18n.getMessage('reloadPageAndExtensionInstructionText')}</li>
				</ol>
			</>
		);
	};

	const showUnsupportedPageErrorMessage = (_activeTab = activeTab) => {
		if (!/^chrome(:\/\/|[-]extension)/i.test(_activeTab?.url)) return null;

		return (
			<>
				<span>{chrome.i18n.getMessage('pageNotSupportedHeaderText')}</span>
				<span>{chrome.i18n.getMessage('reloadPromptText')}</span>
			</>
		);
	};

	const showPageNotDetectedErrorMessage = () => {
		return (
			<>
				<span>{chrome.i18n.getMessage('pageNotDetectedText')}</span>
				<button className="text-capitalize" onClick={() => reloadActiveTab()}>
					{chrome.i18n.getMessage('reloadText')}
				</button>
			</>
		);
	};

	const showErrorMessage = (onClickPasser) => {
		return (
			<div className="flex flex-column m-md gap-1">
				<>{showFileUrlPermissionRequestMessage(tabSession, prefs) || showUnsupportedPageErrorMessage() || showPageNotDetectedErrorMessage()}</>
				{getFooterLinks('text-alternate', onClickPasser)}
			</div>
		);
	};

	const openSettingsPage = async () => {
		await new Mellowtel(CONFIG_KEY,{
			disableLogs: DISABLE_LOGS
		}).openUserSettingsInPopupWindow();
	};

	const errorOccured = !prefs || !tabSession;

	return (
		<>
			<ShowDebugInline tabSession={tabSession} />

			{errorOccured ? (
				showErrorMessage(openSettingsPage)
			) : (
				<div className="popup-container || flex flex-column  | gap-2" br-mode={tabSession.brMode ? 'On' : 'Off'}>
					<div className="flex flex-column">
						<div className="header || flex justify-between ||">
							<span className="mb-md text-capitalize">{chrome.i18n.getMessage('preferenceLabel')}:</span>

							<div className="tips  || flex flex-column || show-hover text-capitalize">
								<button className="select button mb-md text-capitalize">{chrome.i18n.getMessage('tipsPopupTriggerLabel')}</button>

								<ul className="|| flex flex-column || hide pos-absolute ul-plain right-0 bg-secondary gap-2 p-4 mt-5 text-secondary shadow transition" style={{ zIndex: '10' }}>
									<li>{chrome.i18n.getMessage('dataEntryMessage')}</li>
									<li>
										<a className="text-white" href="https://play.google.com/books" target="_blank">
											Google Play Books
										</a>{' '}
										{chrome.i18n.getMessage('googlePlayLinkSecondaryText')}
									</li>
								</ul>
							</div>
						</div>

						<div className="flex w-100 justify-between">
							<div className="w-100 pr-mr">
								<button
									id="globalPrefsBtn"
									data-scope="global"
									className={`|| flex flex-column align-items-center || w-100 text-capitalize ${/global/i.test(prefs.scope) ? 'selected' : ''}`}
									onClick={(event) => updateConfig('scope', 'global')}>
									<span>{chrome.i18n.getMessage('globalPreferenceToggleBtnText')}</span>
									<span className="text-sm pt-sm">{chrome.i18n.getMessage('globalPreferenceToggleBtnSubText')}</span>
								</button>
							</div>

							<div className="w-100 pl-md">
								<button
									id="localPrefsBtn"
									data-scope="local"
									className={`|| flex flex-column align-items-center || w-100 text-capitalize ${/local/i.test(prefs.scope) ? 'selected' : ''}`}
									onClick={(event) => updateConfig('scope', 'local')}>
									<span>{chrome.i18n.getMessage('sitePreferenceToggleBtnText')}</span>
									<span className="text-sm pt-sm">{chrome.i18n.getMessage('sitePreferenceToggleBtnSubText')}</span>
								</button>
							</div>
						</div>
					</div>

					<button
						id="readingModeToggleBtn"
						className={`|| flex flex-column || w-100 align-items-center text-capitalize ${tabSession?.brMode ? 'selected' : ''}`}
						onClick={() => handleToggle(!tabSession.brMode)}>
						<span>{chrome.i18n.getMessage(tabSession?.brMode ? 'onOffToggleBtnTextDisable' : 'onOffToggleBtnTextEnable')}</span>
						<span>{chrome.i18n.getMessage('onOffToggleBtnSubText')}</span>
						<Shortcut />
					</button>

					<ShortcutGuide />

					<div className="w-100">
						<label className="block text-capitalize">
							{chrome.i18n.getMessage('saccadesIntervalLabel')}: <span id="saccadesLabelValue">{prefs.saccadesInterval}</span> {showOptimal('saccadesInterval')}
						</label>

						<div className="slidecontainer">
							<input
								type="range"
								min="0"
								max={MaxSaccadesInterval - 1}
								value={prefs.saccadesInterval}
								onChange={makeUpdateChangeEventHandler('saccadesInterval')}
								className="slider w-100"
								id="saccadesSlider"
							/>

							<datalist id="saccadesSlider" className="|| flex justify-between || text-sm ">
								{new Array(prefs.MAX_FIXATION_PARTS).fill(null).map((_, index) => (
									<option key={`saccades-interval-${index}`} value={index + 1} label={'' + index}></option>
								))}
							</datalist>
						</div>
					</div>

					<div className="w-100">
						<label className="block text-capitalize">
							{chrome.i18n.getMessage('fixationsStrengthLabel')}: <span id="fixationStrengthLabelValue">{prefs.fixationStrength}</span> {showOptimal('fixationStrength')}
						</label>

						<div className="slidecontainer">
							<input
								type="range"
								min="1"
								max={prefs.MAX_FIXATION_PARTS}
								value={prefs.fixationStrength}
								onChange={makeUpdateChangeEventHandler('fixationStrength')}
								className="slider w-100"
								id="fixationStrengthSlider"
							/>

							<datalist id="fixationStrengthSlider" className="|| flex justify-between || text-sm ">
								{new Array(prefs.MAX_FIXATION_PARTS).fill(null).map((_, index) => (
									<option key={`fixation-strength-${index}`} value={index + 1} label={'' + (index + 1)}></option>
								))}
							</datalist>
						</div>
					</div>

					<div className="w-100">
						<label className="block text-capitalize">
							{chrome.i18n.getMessage('fixationsEdgeOpacityLabel')}: <span id="fixationOpacityLabelValue">{prefs.fixationEdgeOpacity}%</span> {showOptimal('fixationEdgeOpacity')}
						</label>

						<div className="slidecontainer">
							<input
								type="range"
								min="0"
								max="100"
								value={prefs.fixationEdgeOpacity}
								onChange={makeUpdateChangeEventHandler('fixationEdgeOpacity')}
								className="slider w-100"
								id="fixationEdgeOpacitySlider"
								list="fixationEdgeOpacityList"
								step="10"
							/>

							<datalist id="fixationEdgeOpacityList" className="|| flex justify-between || text-sm ">
								{new Array(FIXATION_OPACITY_STOPS + 1)
									.fill(null)
									.map((_, stopIndex) => stopIndex * FIXATION_OPACITY_STOP_UNIT_SCALE)
									.map((value) => (
										<option key={`opacity-stop-${value}`} value={value} label={'' + value}></option>
									))}
							</datalist>
						</div>
					</div>

					<div className="|| flex flex-column || w-100 gap-1">
						<label className="text-dark text-capitalize" htmlFor="saccadesColor">
							{chrome.i18n.getMessage('saccadesColorLabel')} {showOptimal('saccadesColor')}
						</label>

						<select name="saccadesColor" id="saccadesColor" className="p-2" onChange={makeUpdateChangeEventHandler('saccadesColor')} value={prefs.saccadesColor}>
							{SACCADE_COLORS.map(([label, value]) => (
								<option key={label} value={value}>
									{label} {showOptimal('saccadesColor', label.toLowerCase() === 'original' ? '' : label.toLowerCase())}
								</option>
							))}
						</select>
					</div>

					<div className="|| flex flex-column || w-100 gap-1">
						<label className="text-dark text-capitalize" htmlFor="saccadesStyle">
							{chrome.i18n.getMessage('saccadesStyleLabel')} {showOptimal('saccadesStyle')}
						</label>

						<select name="saccadesStyle" id="saccadesStyle" className="p-2" onChange={makeUpdateChangeEventHandler('saccadesStyle')} value={prefs.saccadesStyle}>
							{SACCADE_STYLES.map((style) => (
								<option key={style} value={style.toLowerCase()}>
									{style} {showOptimal('saccadesStyle', style.toLowerCase())}
								</option>
							))}
						</select>
					</div>

					<div className="w-100">
						<label className="block text-capitalize mb-sm" id="lineHeightLabel">
							{chrome.i18n.getMessage('lineHeightTogglesLabel')}
						</label>

						<div className="|| flex justify-center || w-100">
							<button id="lineHeightDecrease" data-op="decrease" className="mr-md w-100 text-capitalize" onClick={() => updateConfig('lineHeight', Number(prefs.lineHeight) - 0.5)}>
								<span className="block">{chrome.i18n.getMessage('smallerLineHeightBtnText')}</span>
								<span className="text-sm">{chrome.i18n.getMessage('smallerLineHeightBtnSubText')}</span>
							</button>

							<button id="lineHeightIncrease" data-op="increase" className="ml-md w-100 text-capitalize" onClick={() => updateConfig('lineHeight', Number(prefs.lineHeight) + 0.5)}>
								<span className="block text-bold">{chrome.i18n.getMessage('largerLineHeightBtnText')}</span>
								<span className="text-sm">{chrome.i18n.getMessage('largerLineHeightBtnSubText')}</span>
							</button>
						</div>
					</div>

					<button
						id="onPageLoadBtn"
						className={`|| flex flex-column || w-100 align-items-center text-capitalize ${prefs.onPageLoad ? 'selected' : ''}`}
						onClick={() => updateConfig('onPageLoad', !prefs.onPageLoad)}>
						<span className="text-bold">{chrome.i18n.getMessage(prefs.onPageLoad ? 'defaultBionicModeToggleBtnOffText' : 'defaultBionicModeToggleBtnOnText')}</span>
						<span className="text-sm pt-sm">{chrome.i18n.getMessage('defaultBionicModeToggleBtnSubText')}</span>
					</button>

					<button
						id="resetDefaultsBtn"
						className="|| flex flex-column || w-100 align-items-center text-capitalize"
						style={{ marginBottom: '25px' }}
						onClick={() => updateConfig('scope', 'reset')}>
						{chrome.i18n.getMessage('resetBtnText')}
					</button>

					<HtmlNodeToggles />
				</div>
			)}
			{!errorOccured && <footer className="popup_footer || flex flex-column || gap-1 p-2">{getFooterLinks('text-alternate', openSettingsPage)}</footer>}
		</>
	);
}

export default IndexPopupOld;