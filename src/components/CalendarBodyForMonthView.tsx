import calendarize from 'calendarize'
import dayjs from 'dayjs'
import * as React from 'react'
import {
  Animated,
  Platform,
  Text,
  TouchableHighlight,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native'

import { u } from '../commonStyles'
import { useNow } from '../hooks/useNow'
import {
  CalendarCellStyle,
  CalendarCellTextStyle,
  EventCellStyle,
  EventRenderer,
  HorizontalDirection,
  ICalendarEventBase,
  WeekNum,
} from '../interfaces'
import { useTheme } from '../theme/ThemeContext'
import { getWeeksWithAdjacentMonths } from '../utils/datetime'
import { typedMemo } from '../utils/react'
import { CalendarEventForMonthView } from './CalendarEventForMonthView'

interface CalendarBodyForMonthViewProps<T extends ICalendarEventBase> {
  containerHeight: number
  targetDate: dayjs.Dayjs
  events: T[]
  style: ViewStyle
  eventCellStyle?: EventCellStyle<T>
  calendarCellStyle?: CalendarCellStyle
  calendarCellTextStyle?: CalendarCellTextStyle
  hideNowIndicator?: boolean
  showAdjacentMonths: boolean
  onPressCell?: (date: Date) => void
  onPressDateHeader?: (date: Date) => void
  onPressEvent?: (event: T) => void
  onSwipeHorizontal?: (d: HorizontalDirection) => void
  renderEvent?: EventRenderer<T>
  maxVisibleEventCount: number
  weekStartsOn: WeekNum
  eventMinHeightForMonthView: number
  moreLabel: string
  onPressMoreLabel?: (events: T[], date: Date) => void
  sortedMonthView: boolean
  renderCustomDateForMonth?: (date: Date) => React.ReactElement | null
  disableMonthEventCellPress?: boolean
}

const INVALID_INDEX: -1 = -1

function _CalendarBodyForMonthView<T extends ICalendarEventBase>({
  containerHeight,
  targetDate,
  style,
  onPressCell,
  onPressDateHeader,
  events,
  onPressEvent,
  eventCellStyle,
  calendarCellStyle,
  calendarCellTextStyle,
  hideNowIndicator,
  showAdjacentMonths,
  renderEvent,
  weekStartsOn,
  eventMinHeightForMonthView,
  moreLabel,
  renderCustomDateForMonth,
  disableMonthEventCellPress,
}: CalendarBodyForMonthViewProps<T>) {
  const { now } = useNow(!hideNowIndicator)
  const [calendarWidth, setCalendarWidth] = React.useState<number>(0)
  const [calendarCellHeight, setCalendarCellHeight] = React.useState<number>(0)

  const weeks = React.useMemo(
    () =>
      showAdjacentMonths
        ? getWeeksWithAdjacentMonths(targetDate, weekStartsOn)
        : calendarize(targetDate.toDate(), weekStartsOn),
    [showAdjacentMonths, targetDate, weekStartsOn],
  )

  const minCellHeight = containerHeight / 5 - 30
  const theme = useTheme()

  const getCalendarCellStyle = React.useMemo(
    () => (typeof calendarCellStyle === 'function' ? calendarCellStyle : () => calendarCellStyle),
    [calendarCellStyle],
  )

  const getCalendarCellTextStyle = React.useMemo(
    () =>
      typeof calendarCellTextStyle === 'function'
        ? calendarCellTextStyle
        : () => calendarCellTextStyle,
    [calendarCellTextStyle],
  )

  const sortedEvents = React.useMemo(() => {
    const eventLocateMap: {
      [date: string]: { 0: T | null; 1: T | null; 2: T | null; count: number }
    } = {}

    events
      // Sort events by the length of the event and the start time
      .sort((a, b) => a.start.getTime() - a.end.getTime() - (b.start.getTime() - b.end.getTime()))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      // Loop events and locate them
      .forEach((event) => {
        const startTime = dayjs(event.start).startOf('day')
        const endTime = dayjs(event.end).endOf('day')

        let indexToBeLocated: 0 | 1 | 2 | typeof INVALID_INDEX = (() => {
          const k = getSortedEventKey(startTime)
          if (eventLocateMap[k]) {
            if (!eventLocateMap[k][0]) return 0
            else if (!eventLocateMap[k][1]) return 1
            else if (!eventLocateMap[k][2]) return 2
            else return INVALID_INDEX
          } else {
            return 0
          }
        })()

        let time = startTime
        while (time.isBefore(endTime)) {
          const eventKey = getSortedEventKey(time)

          // 일요일이라면, 다시 index 찾아주기
          if (time.day() === 0) {
            if (eventLocateMap[eventKey]) {
              const newIndexToBeLocated: 0 | 1 | 2 | undefined = ([0, 1, 2] as (0 | 1 | 2)[]).find(
                (k) => !eventLocateMap[eventKey][k as keyof (typeof eventLocateMap)[string]],
              )
              indexToBeLocated = newIndexToBeLocated ? newIndexToBeLocated : INVALID_INDEX
            }
          }

          // 아직 정의된 map이 없다면 넣어주자
          if (!eventLocateMap[eventKey]) {
            eventLocateMap[eventKey] = { 0: null, 1: null, 2: null, count: 0 }
          }

          const locatedResult = eventLocateMap[eventKey]

          // 이벤트를 해당 index에 넣어주기
          if (indexToBeLocated !== INVALID_INDEX && !locatedResult[indexToBeLocated]) {
            locatedResult[indexToBeLocated] = event
          }

          locatedResult.count += 1

          time = time.add(1, 'day')
        }
      })

    return eventLocateMap
  }, [events])

  const renderDateCell = (date: dayjs.Dayjs | null, index: number) => {
    if (date && renderCustomDateForMonth) {
      return renderCustomDateForMonth(date.toDate())
    }

    return (
      <Text
        style={[
          { textAlign: 'center' },
          theme.typography.sm,
          {
            color:
              date?.format('YYYY-MM-DD') === now.format('YYYY-MM-DD')
                ? theme.palette.primary.main
                : date?.month() !== targetDate.month()
                ? theme.palette.gray['500']
                : theme.palette.gray['800'],
          },
          {
            ...getCalendarCellTextStyle(date?.toDate(), index),
          },
        ]}
      >
        {date && date.format('D')}
      </Text>
    )
  }

  return (
    <View
      style={[
        {
          height: containerHeight,
        },
        u['flex-column'],
        u['flex-1'],
        u['border-b'],
        u['border-l'],
        u['border-r'],
        u['rounded'],
        { borderColor: theme.palette.gray['200'] },
        style,
      ]}
      onLayout={({ nativeEvent: { layout } }) => {
        setCalendarWidth(layout.width)
      }}
    >
      {weeks.map((week, i) => (
        <View
          key={i}
          style={[
            u['flex-1'],
            theme.isRTL ? u['flex-row-reverse'] : u['flex-row'],
            Platform.OS === 'android' && style, // TODO: in Android, backgroundColor is not applied to child components
            {
              minHeight: minCellHeight,
            },
          ]}
        >
          {week
            .map((d) =>
              showAdjacentMonths ? targetDate.date(d) : d > 0 ? targetDate.date(d) : null,
            )
            .map((date, ii) => (
              <TouchableOpacity
                onPress={() => date && onPressCell && onPressCell(date.toDate())}
                style={[
                  i > 0 && u['border-t'],
                  theme.isRTL && ii > 0 && u['border-r'],
                  !theme.isRTL && ii > 0 && u['border-l'],
                  { borderColor: theme.palette.gray['200'] },
                  u['p-2'],
                  u['flex-1'],
                  u['flex-column'],
                  {
                    minHeight: minCellHeight,
                  },
                  {
                    ...getCalendarCellStyle(date?.toDate(), i),
                  },
                ]}
                key={ii}
                onLayout={({ nativeEvent: { layout } }) =>
                  // Only set calendarCellHeight once because they are all same
                  i === 0 && ii === 0 && setCalendarCellHeight(layout.height)
                }
              >
                <TouchableOpacity
                  onPress={() =>
                    date &&
                    (onPressDateHeader
                      ? onPressDateHeader(date.toDate())
                      : onPressCell && onPressCell(date.toDate()))
                  }
                >
                  {renderDateCell(date, i)}
                </TouchableOpacity>
                {date &&
                  sortedEvents[getSortedEventKey(date)] &&
                  [0, 1, 2, 3].reduce(
                    (acc, curr, index) => {
                      if (curr === 3) {
                        return {
                          ...acc,
                          result: [
                            ...acc.result,
                            <Text
                              key={index}
                              style={[
                                theme.typography.moreLabel,
                                { marginTop: 2, color: theme.palette.moreLabel },
                              ]}
                              // onPress={() => onPressMoreLabel?.(events, date.toDate())}
                            >
                              {moreLabel
                                .replace(
                                  '{moreCount}',
                                  `${
                                    sortedEvents[getSortedEventKey(date)].count - acc.renderedCount
                                  }`,
                                )
                                .replace(
                                  '{count}',
                                  `${sortedEvents[getSortedEventKey(date)].count}`,
                                )}
                            </Text>,
                          ],
                        }
                      }

                      if (
                        !sortedEvents[getSortedEventKey(date)] ||
                        !sortedEvents[getSortedEventKey(date)][curr as keyof typeof Object.keys]
                      ) {
                        return {
                          ...acc,
                          result: [
                            ...acc.result,
                            <View key={index} style={{ minHeight: eventMinHeightForMonthView }} />,
                          ],
                        }
                      }

                      return {
                        renderedCount: acc.renderedCount + 1,
                        result: [
                          ...acc.result,
                          <CalendarEventForMonthView
                            key={index}
                            event={
                              sortedEvents[getSortedEventKey(date)][
                                curr as keyof typeof Object.keys
                              ]
                            }
                            eventCellStyle={eventCellStyle}
                            onPressEvent={onPressEvent}
                            renderEvent={renderEvent}
                            date={date}
                            dayOfTheWeek={ii}
                            calendarWidth={calendarWidth}
                            isRTL={theme.isRTL}
                            eventMinHeightForMonthView={eventMinHeightForMonthView}
                            showAdjacentMonths={showAdjacentMonths}
                          />,
                        ],
                      }
                    },
                    { result: [], renderedCount: 0 } as {
                      result: (null | JSX.Element)[]
                      renderedCount: number
                    },
                  ).result}
                {disableMonthEventCellPress && (
                  <>
                    <TouchableGradually
                      style={{
                        height: calendarCellHeight,
                        width: Math.floor(calendarWidth / 7),
                        position: 'absolute',
                        top: 0,
                        left: 0,
                      }}
                      onPress={() => date && onPressCell && onPressCell(date.toDate())}
                    />
                  </>
                )}
              </TouchableOpacity>
            ))}
        </View>
      ))}
    </View>
  )
}

export const CalendarBodyForMonthView = typedMemo(_CalendarBodyForMonthView)

function TouchableGradually({ onPress, style }: { style?: ViewStyle; onPress: () => void }) {
  const backgroundColor = React.useRef(new Animated.Value(0)).current

  const handlePressIn = () => {
    Animated.timing(backgroundColor, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start()
  }

  const handlePressOut = () => {
    Animated.timing(backgroundColor, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start()
  }

  return (
    <TouchableHighlight
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      underlayColor="transparent"
      style={style}
    >
      <Animated.View
        style={[
          {
            backgroundColor: backgroundColor.interpolate({
              inputRange: [0, 1],
              outputRange: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.2)'],
            }),
          },
          style,
        ]}
      />
    </TouchableHighlight>
  )
}

function getSortedEventKey(date: dayjs.Dayjs) {
  return date.startOf('day').toISOString()
}
