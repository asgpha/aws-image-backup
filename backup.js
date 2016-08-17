var program = require('commander');
var moment = require('moment');
var AWS = require('aws-sdk');
var sleep = require('sleep');

program
    .version('0.1')
    .option('-i, --instances [value]', 'Comma seperate list of instances')
    .option('-d, --days [value]', 'Retention days')
    .option('-r --region [value]', 'AWS Region', 'us-east-1')
    .parse(process.argv);

var todayString = moment().format('YYYYMMDD')
var deleteDateString = moment().subtract(parseInt(program.days), 'days').format('YYYYMMDD');
var instances = program.instances.split(',').map(function (t) { return t.trim(); });


AWS.config.update({region: program.region});


var ec2 = new AWS.EC2();

for (i = 0; i < instances.length; i++) { 
    var instanceId = instances[i];

    ec2.createImage({
        InstanceId: instanceId,
        Name: todayString + '_' + instanceId,
    }, function (err, data) {
        if (err) {
            console.log(err, err.stack);
        }
        else {
            console.log(data.ImageId.toString() + ' created from ' + instanceId);
            sleep.sleep(60);

            console.log('working on deleting old ami images (' + deleteDateString + '_' + instanceId + ')')

            ec2.describeImages({
                Filters: [
                    {
                        Name: 'name',
                        Values: [
                            deleteDateString + '_' + instanceId
                        ]
                    }
                ]
            }, function (err, data) {
                if (err) {
                    console.log(err, err.stack);
                }
                else {
                    var images = data.Images;

                    for(im = 0; im < images.length; im++) {
                        var imageId = images[im].ImageId;

                        console.log('deleting ami-' + imageId);

                        ec2.deregisterImage({
                            ImageId: imageId
                        }, function (err, data) {
                            if (err) {
                                console.log(err, err.stack);
                            }
                            else {
                                console.log(deleteDateString + '_' + instanceId + ' has been deregistered');
                                console.log('working on deleting old snapshots (' + imageId + ')');

                                ec2.describeSnapshots({
                                    Filters: [
                                        {
                                            Name: 'description',
                                            Values: [
                                                'Created by CreateImage(' + instanceId + ') for ' + imageId + '*'
                                            ]
                                        }
                                    ]
                                }, function (err, data) {
                                    if (err) {
                                        console.log(err, err.stack);
                                    }
                                    else {
                                        var snapshots = data.Snapshots;

                                        for (s = 0; s < snapshots.length; s++) {
                                            var snapshot = snapshots[s];

                                            ec2.deleteSnapshot({
                                                SnapshotId: snapshot.SnapshotId
                                            }, function (err, data) {
                                                if (err) {
                                                    console.log(err, err.stack);
                                                }
                                                else {
                                                    console.log(snapshot.SnapshotId + ' has been deleted');
                                                }
                                            })
                                        }
                                    }
                                });
                            }
                        });
                    }
                }
            });
        }
    });
}
