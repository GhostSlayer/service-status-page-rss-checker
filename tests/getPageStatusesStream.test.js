jest.mock('node-fetch');
const { createStatusPage } = require('./factories/statusPage');
const fetch = require('node-fetch');
const { Response } = require('node-fetch');
const FakeTimers = require("@sinonjs/fake-timers");
const { toArray, take } = require('rxjs/operators');

const { getPageStatusesStream } = require('../check');


let clock;
const RFC822Regexp = /(Sun|Fri|Mon|Sat|Thu|Tue|Wed)\,\s[0-9]{2}\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s[0-9]{4}\s[0-9]{2}\:[0-9]{2}\:[0-9]{2}\s[+-][0-9]{4}/;

beforeEach((done) => {
    clock = FakeTimers.install({ toFake: ['Date'], shouldAdvanceTime: true, advanceTimeDelta: 20 });
    clock.setSystemTime(new Date('2020-08-09T15:38:26.972Z'));
    fetch.mockClear();
    done();
});

afterEach((done) => {
    clock.uninstall();
    done();
});


describe('for current date', () => {
    describe('single url', () => {
        describe('Incidents with status != Resolved', () => {
            test.each([
                ['Investigating'],
                ['Monitoring'],
                ['Identified'],
                ['Update'],
            ])('should return incidents with status "%s"', async (status) => {
                const data = {
                    items: [{
                        incidents: [{
                            date: new Date(),
                            status,
                            description: 'some description'
                        }]
                    }]
                };

                const response = new Response();
                response.ok = true;
                response.text = jest.fn().mockReturnValue(Promise.resolve(createStatusPage(data)));

                fetch.mockReturnValue(Promise.resolve(response));

                const actual = await getPageStatusesStream([
                    'http://some.service.io/status_page/rss'
                ]).toPromise();

                expect(fetch).toHaveBeenCalledTimes(1);
                expect(actual).toEqual(expect.objectContaining({
                    lastIncident: expect.objectContaining({
                        channelTitle: expect.any(String),
                        pubDate: expect.stringMatching(RFC822Regexp),
                        status,
                        title: expect.any(String),
                    }),
                    service: expect.any(String),
                }));
            }); 
        });

        describe('Incidents with status == Resolved', () => {
            test('should not return incidents', async () => {
                const data = {
                    items: [{
                        incidents: [{
                            date: new Date(),
                            status: 'Resolved',
                            description: 'some description'
                        }]
                    }]
                };

                const response = new Response();
                response.ok = true;
                response.text = jest.fn().mockReturnValue(Promise.resolve(createStatusPage(data)));

                fetch.mockReturnValue(Promise.resolve(response));

                const actual = await getPageStatusesStream([
                    'http://some.service.io/status_page/rss'
                ]).toPromise();

                expect(fetch).toHaveBeenCalledTimes(1);
                expect(actual).toEqual({
                    empty: true,
                    message: "No incidents found!",
                });
            });
        });
    });

    describe('multiple urls', () => {
        describe('Incidents with status != Resolved', () => {
            test.each([
                ['Investigating'],
                ['Monitoring'],
                ['Identified'],
                ['Update'],
            ])('should return incidents with status "%s"', async (statusName) => {
                const constructResponse = (status) => {
                    const response = new Response();
                    response.ok = true;
                    const data = createStatusPage({
                        items: [{
                            incidents: [{
                                date: new Date(),
                                status,
                            }]
                        }]
                    });
                    response.text = jest.fn().mockReturnValue(Promise.resolve(data));
                    return response;
                }

                fetch.mockReturnValueOnce(Promise.resolve(constructResponse(statusName)));
                fetch.mockReturnValueOnce(Promise.resolve(constructResponse(statusName)));
                fetch.mockReturnValueOnce(Promise.resolve(constructResponse(statusName)));

                const results = await getPageStatusesStream([
                    'http://some.service.io/status_page/rss',
                    'http://some2.service.io/status_page/rss',
                    'http://some3.service.io/status_page/rss'
                ]).pipe(
                    take(3), 
                    toArray()
                ).toPromise();

                expect(results).toHaveLength(3);
                expect(results).toEqual(expect.arrayContaining([
                    expect.objectContaining({
                        lastIncident: expect.objectContaining({
                            channelTitle: expect.any(String),
                            pubDate: expect.stringMatching(RFC822Regexp),
                            status: statusName,
                            title: expect.any(String),
                        }),
                        service: expect.any(String),
                    })
                ]));
            });
        });    
    });
});
